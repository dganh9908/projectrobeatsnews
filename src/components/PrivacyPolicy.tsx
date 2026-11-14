import React from 'react';
import { ArrowLeft, Mail, ShieldCheck, Lock, Database, UserCheck } from 'lucide-react';

interface PrivacyPolicyProps {
  onBackToFeed: () => void;
}

const CONTACT_EMAIL = 'anh6052018@gmail.com';

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBackToFeed }) => {
  return (
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-page-enter">
      {/* Return action */}
      <div className="mb-8">
        <button
          type="button"
          onClick={onBackToFeed}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 hover:border-zinc-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
          <span>Back to News Feed</span>
        </button>
      </div>

      {/* Document Header */}
      <header className="pb-6 mb-8 border-b border-zinc-800/80 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span>RoBeats! News</span>
          <span aria-hidden="true">·</span>
          <span>Legal &amp; Google OAuth Disclosure</span>
          <span aria-hidden="true">·</span>
          <span>Last Updated: November 13, 2026</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight text-balance">
          Privacy Policy
        </h1>

        <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl">
          This Privacy Policy explains how <strong className="text-white font-semibold">RoBeats! News</strong> collects, uses, stores, and protects your personal information when you browse our site or sign in using Google OAuth.
        </p>
      </header>

      {/* Editorial Sections */}
      <div className="space-y-10 text-sm sm:text-[15px] text-zinc-300 leading-relaxed">
        {/* Section 01: Data Collected */}
        <section className="space-y-3 pb-8 border-b border-zinc-800/60">
          <div className="flex items-center gap-2.5 text-white">
            <UserCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              01. Data Collected
            </h2>
          </div>

          <p>
            RoBeats! News uses <strong className="text-white font-semibold">Google Sign-In (Google OAuth 2.0)</strong> via Firebase Authentication. We request only the standard <code className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-cyan-300 text-xs font-mono">email</code> and <code className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-cyan-300 text-xs font-mono">profile</code> scopes. Through this sign-in process, our application strictly collects only:
          </p>

          <ul className="space-y-2 pl-5 list-disc marker:text-cyan-400 text-zinc-300">
            <li>
              <strong className="text-white font-medium">Display Name:</strong> Your Google account name used to identify you across your profile and comments.
            </li>
            <li>
              <strong className="text-white font-medium">Email Address:</strong> Your Google email address used to uniquely authenticate your account and determine administrative permissions.
            </li>
            <li>
              <strong className="text-white font-medium">Profile Picture (Avatar):</strong> Your Google profile photo URL used as your avatar on RoBeats! News.
            </li>
          </ul>

          <p className="text-zinc-400 text-xs sm:text-sm">
            If you choose to participate in community features, we also store optional profile fields you voluntarily submit (such as your custom username, Roblox username, or player bio) along with your comments, post reactions, and daily login streak progress. We do not collect passwords, payment details, location data, or access any other Google Workspace data.
          </p>
        </section>

        {/* Section 02: How Data is Used */}
        <section className="space-y-3 pb-8 border-b border-zinc-800/60">
          <div className="flex items-center gap-2.5 text-white">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              02. How Data Is Used
            </h2>
          </div>

          <p>
            The limited information received from Google OAuth is used exclusively to operate and personalize your experience on <strong className="text-white font-semibold">RoBeats! News</strong>:
          </p>

          <ul className="space-y-2 pl-5 list-disc marker:text-cyan-400 text-zinc-300">
            <li>
              <strong className="text-white font-medium">Account Creation &amp; Authentication:</strong> Creating your RoBeats! News profile and verifying your identity securely each time you sign in.
            </li>
            <li>
              <strong className="text-white font-medium">Progress &amp; Streak Tracking:</strong> Saving your daily login check-in streak and best streak records across sessions and devices.
            </li>
            <li>
              <strong className="text-white font-medium">Comments &amp; Community Interactions:</strong> Displaying your name and avatar next to your published comments, news reactions, and staff/admin articles.
            </li>
            <li>
              <strong className="text-white font-medium">Role &amp; Access Control:</strong> Verifying authorized staff and administrator access for publishing or moderating RoBeats! News content.
            </li>
          </ul>
        </section>

        {/* Section 03: Data Sharing & Storage */}
        <section className="space-y-3 pb-8 border-b border-zinc-800/60">
          <div className="flex items-center gap-2.5 text-white">
            <Database className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              03. Data Sharing &amp; Storage
            </h2>
          </div>

          <p>
            <strong className="text-white font-semibold">We do not sell, rent, trade, or share your personal data with any third parties</strong>, advertisers, or data brokers. Your Google user data is never used for targeted advertising or unrelated profiling.
          </p>

          <p>
            All authentication tokens and user records are stored securely on <strong className="text-white font-semibold">Google Cloud / Firebase Authentication and Cloud Firestore</strong>. Data is encrypted in transit via HTTPS/TLS and protected at rest by Google Cloud infrastructure and strict Firestore Security Rules that restrict data modification to authenticated owners and authorized administrators.
          </p>

          <p className="text-zinc-400 text-xs sm:text-sm">
            You can also revoke RoBeats! News&apos;s access to your Google account at any time through your Google Account Permissions page at{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            >
              myaccount.google.com/permissions
            </a>
            .
          </p>
        </section>

        {/* Section 04: User Rights & Contact */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5 text-white">
            <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              04. User Rights &amp; Contact
            </h2>
          </div>

          <p>
            You have the right to access, update, or request permanent deletion of your personal data stored on RoBeats! News at any time:
          </p>

          <ul className="space-y-2 pl-5 list-disc marker:text-cyan-400 text-zinc-300">
            <li>
              <strong className="text-white font-medium">Update Profile Information:</strong> Sign in and open your Account Profile modal to edit your username, display name, Roblox username, bio, or avatar at any time.
            </li>
            <li>
              <strong className="text-white font-medium">Request Data Deletion:</strong> To permanently delete your RoBeats! News account record, daily streak history, and associated comments from our database, please send an email to our privacy contact below with the subject line <span className="font-mono text-xs text-zinc-200">&quot;Data Deletion Request&quot;</span> from the Google email address associated with your account. Requests are processed within 7 business days.
            </li>
          </ul>

          <div className="p-5 rounded-2xl bg-[#111622] border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-zinc-400">
                Privacy &amp; Data Deletion Contact
              </div>
              <div className="text-sm sm:text-base font-semibold text-white font-mono">
                {CONTACT_EMAIL}
              </div>
            </div>

            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('RoBeats! News - Data Deletion Request')}`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Contact via Email</span>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
};
