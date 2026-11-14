import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  getFirestoreDocument,
} from '../../../../cloudflare/firestoreRest.js';

const BOOTSTRAP_ADMIN_EMAILS = ['chautuan9461@gmail.com', 'anh6052018@gmail.com'];

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function buildDailyMissionEmbedDescription(post) {
  const buckets = {
    Star: [],
    Pro: [],
    Amateur: [],
    Novice: [],
    Beginner: [],
  };

  for (const song of post.songs || []) {
    const rawChosen = String(song.chosenDifficulty || 'N').toUpperCase();
    const diffLetter = rawChosen.startsWith('E') ? 'E' : rawChosen.startsWith('H') ? 'H' : 'N';
    const diffVal =
      diffLetter === 'E'
        ? song.difficulty?.easy || '-'
        : diffLetter === 'H'
        ? song.difficulty?.hard || '-'
        : song.difficulty?.normal || '-';
    const difficultyText = diffLetter === 'E' ? 'Easy' : diffLetter === 'H' ? 'Hard' : 'Normal';
    const isNoMisses = Boolean(song.noMisses || song.isNoMisses);

    let rank = song.missionRank;
    if (!rank) {
      const numLevel = parseInt(diffVal, 10);
      if (!isNaN(numLevel) && numLevel > 0) {
        if (numLevel >= 25) rank = 'Star';
        else if (numLevel >= 20) rank = 'Pro';
        else if (numLevel >= 15) rank = 'Amateur';
        else if (numLevel >= 8) rank = 'Novice';
        else rank = 'Beginner';
      } else {
        rank = post.missionRank || 'Beginner';
      }
    }

    const rawEl = String(song.element || '').trim();
    const cleanEl = rawEl.toLowerCase() === 'standard' ? '' : rawEl;
    const item = {
      level: diffVal !== '-' ? diffVal : '1',
      title: song.title || 'Unknown Song',
      artist: song.artist || 'Unknown Artist',
      element: cleanEl,
      isNoMisses,
      difficultyText,
    };

    if (buckets[rank]) buckets[rank].push(item);
    else buckets.Beginner.push(item);
  }

  const formatList = (items) => {
    if (items.length === 0) return '- "No missions" - None';
    return items
      .map((s) => {
        const elementPrefix = s.element ? `${s.element} / ` : '';
        return s.isNoMisses
          ? `- :star: [${s.level}] ${elementPrefix}${s.title} - ${s.artist} [${s.difficultyText}] (No Misses)`
          : `- [${s.level}] ${elementPrefix}${s.title} - ${s.artist} [${s.difficultyText}]`;
      })
      .join('\n');
  };

  return [
    `## <:star:1295611495383695451> - Star missions`,
    formatList(buckets.Star),
    ``,
    `## <:pro:1295611421866070016> - Pro missions`,
    formatList(buckets.Pro),
    ``,
    `## <:amateur:1295611203325792287> - Amateur missions`,
    formatList(buckets.Amateur),
    ``,
    `## <:novice:1284381928044367944> - Novice missions`,
    formatList(buckets.Novice),
    ``,
    `## <:beginner:1284381903578861578> \n - Beginner missions`,
    formatList(buckets.Beginner),
  ].join('\n');
}

export async function onRequestPost(context) {
  try {
    const { params, request, env } = context;
    const postId = sanitizeId(params.id);
    const authCtx = await resolveFirestoreAuth(request, env);

    if (!authCtx.bearerToken || !authCtx.uid) {
      return jsonResponse(
        { success: false, error: 'Google sign-in required to broadcast to Discord webhook.' },
        401
      );
    }

    // Verify staff or admin privileges
    let isAuthorized =
      authCtx.emailVerified &&
      authCtx.email &&
      BOOTSTRAP_ADMIN_EMAILS.includes(authCtx.email.toLowerCase());

    if (!isAuthorized) {
      const adminDoc = await getFirestoreDocument(
        env,
        `admins/${sanitizeId(authCtx.uid)}`,
        authCtx.bearerToken
      ).catch(() => null);
      if (adminDoc && (adminDoc.role === 'admin' || adminDoc.role === 'staff')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return jsonResponse({ success: false, error: 'Staff or Admin role required.' }, 403);
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const storedPost = await getFirestoreDocument(env, `posts/${postId}`, authCtx.bearerToken).catch(() => null);
    const post = {
      ...(storedPost || {}),
      ...body,
      id: postId,
    };

    if (!post.category) {
      return jsonResponse({ success: false, error: 'Post not found or missing category.' }, 404);
    }

    let webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
    if (!webhookUrl) {
      const hooksDoc = await getFirestoreDocument(env, 'webhooks/discord', authCtx.bearerToken).catch(() => null);
      if (hooksDoc) {
        const map = {
          'Daily mission': hooksDoc.dailyMission,
          'Weekly mission': hooksDoc.weeklyMission,
          'New song': hooksDoc.newSong,
          'Updates': hooksDoc.updates,
        };
        webhookUrl = String(map[post.category] || '').trim();
      }
    }

    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      return jsonResponse(
        {
          success: false,
          error: `No Discord Webhook URL configured for "${post.category}". Please configure it in Admin Panel first.`,
        },
        400
      );
    }

    let color = 0x06b6d4;
    if (post.category === 'Weekly mission') color = 0xf97316;
    else if (post.category === 'Weekly Leaderboard') color = 0xf59e0b;
    else if (post.category === 'New song') color = 0x2563eb;
    else if (post.category === 'Updates') color = 0x71717a;

    const authorName = post.author?.name || authCtx.email?.split('@')[0] || 'Staff';
    const authorRole = post.author?.role || 'Staff';
    const postDateFormatted = post.publishedAt
      ? new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const isDailyMission = post.category === 'Daily mission';
    const embedTitle = isDailyMission ? `Header: " ${post.title || 'Today daily missions'}"` : `🎶 ${post.title || 'RoBeats News'}`;
    const embedDescription = isDailyMission
      ? buildDailyMissionEmbedDescription(post)
      : post.content || post.subtitle || `New ${post.category} update on RoBeats News!`;
    const embedFooterText = isDailyMission
      ? `Poster: "${authorName}" | Post date: "${postDateFormatted}"`
      : `RoBeats News Network • Posted by ${authorName}`;

    const fields = [
      { name: '📂 Category', value: post.category, inline: true },
      { name: '👤 Author', value: `${authorName} (${authorRole})`, inline: true },
    ];

    if (!isDailyMission && Array.isArray(post.songs) && post.songs.length > 0) {
      const songLines = post.songs
        .map((s, idx) => {
          const rawChosen = String(s.chosenDifficulty || 'N').toUpperCase();
          const diffLetter = rawChosen.startsWith('E') ? 'E' : rawChosen.startsWith('H') ? 'H' : 'N';
          const diffNum =
            diffLetter === 'E'
              ? s.difficulty?.easy || '-'
              : diffLetter === 'H'
              ? s.difficulty?.hard || '-'
              : s.difficulty?.normal || '-';
          const scoreText = s.requiredScore ? ` (Score: ${s.requiredScore})` : '';
          const rawEl = String(s.element || '').trim();
          const elSuffix = rawEl && rawEl.toLowerCase() !== 'standard' ? ` - ${rawEl}` : '';
          return `**${idx + 1}. ${s.title}** by ${s.artist} [**${diffLetter} ${diffNum}**${elSuffix}]${scoreText}`;
        })
        .join('\n');
      fields.push({
        name: `🎵 Featured Songs (${post.songs.length})`,
        value: songLines.slice(0, 1024),
        inline: false,
      });
    }

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'RoBeats News Bot',
        embeds: [
          {
            title: embedTitle.slice(0, 256),
            description: embedDescription.slice(0, 4096),
            color,
            fields,
            ...(post.coverImage ? { image: { url: post.coverImage } } : {}),
            footer: { text: embedFooterText.slice(0, 2048) },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    if (!discordRes.ok) {
      const errText = await discordRes.text().catch(() => '');
      return jsonResponse(
        { success: false, error: `Discord webhook rejected request (${discordRes.status}): ${errText.slice(0, 200)}` },
        502
      );
    }

    return jsonResponse(
      {
        success: true,
        message: `Successfully broadcast "${post.title || postId}" to Discord [${post.category}] webhook!`,
      },
      200
    );
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to publish webhook' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405);
}
