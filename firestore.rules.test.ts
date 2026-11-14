// Security Rules Verification Specification for RoBeats News Firestore Rules
// Validates all 12 Dirty Dozen payloads against firestore.rules assertions.

export interface SecurityTestCase {
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, any>;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    name: '1. Self-Role Escalation on User Creation',
    operation: 'create',
    path: 'users/attacker_uid',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: { id: 'attacker_uid', username: 'attacker', role: 'admin', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Shadow Ghost Field Injection on Post',
    operation: 'create',
    path: 'posts/post_shadow_1',
    auth: { uid: 'admin_uid', email: 'chautuan9461@gmail.com', email_verified: true },
    payload: { id: 'post_shadow_1', title: 'Test', category: 'Daily mission', authorUid: 'admin_uid', status: 'published', isVerified: true, createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Email Spoofing with Unverified Admin Email',
    operation: 'create',
    path: 'posts/post_spoof_1',
    auth: { uid: 'spoof_uid', email: 'chautuan9461@gmail.com', email_verified: false },
    payload: { id: 'post_spoof_1', title: 'Spoof', category: 'Daily mission', authorUid: 'spoof_uid', status: 'published', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. ID Poisoning with Invalid Characters',
    operation: 'create',
    path: 'posts/bad$id!!',
    auth: { uid: 'admin_uid', email: 'chautuan9461@gmail.com', email_verified: true },
    payload: { id: 'bad$id!!', title: 'Bad ID', category: 'Daily mission', authorUid: 'admin_uid', status: 'published', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Client Timestamp Forgery on Post Creation',
    operation: 'create',
    path: 'posts/post_time_1',
    auth: { uid: 'admin_uid', email: 'chautuan9461@gmail.com', email_verified: true },
    payload: { id: 'post_time_1', title: 'Old Time', category: 'Daily mission', authorUid: 'admin_uid', status: 'published', createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. PII Blanket Read on Private User Info',
    operation: 'get',
    path: 'users/victim_uid/private/info',
    auth: { uid: 'other_uid', email: 'other@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Author UID Spoofing on Post Creation',
    operation: 'create',
    path: 'posts/post_author_spoof',
    auth: { uid: 'admin_uid', email: 'chautuan9461@gmail.com', email_verified: true },
    payload: { id: 'post_author_spoof', title: 'Spoofed', category: 'Daily mission', authorUid: 'victim_uid', status: 'published', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Orphaned Comment on Nonexistent Post',
    operation: 'create',
    path: 'posts/missing_post/comments/c1',
    auth: { uid: 'player_uid', email: 'player@example.com', email_verified: true },
    payload: { id: 'c1', postId: 'missing_post', authorUid: 'player_uid', authorName: 'Player', content: 'Hello', createdAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Non-Staff Post Creation Blocked',
    operation: 'create',
    path: 'posts/post_player_1',
    auth: { uid: 'player_uid', email: 'player@example.com', email_verified: true },
    payload: { id: 'post_player_1', title: 'Unauthorized', category: 'Daily mission', authorUid: 'player_uid', status: 'published', createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Value Poisoning on Reaction Update',
    operation: 'update',
    path: 'posts/post_1',
    auth: { uid: 'player_uid', email: 'player@example.com', email_verified: true },
    payload: { title: 'Hacked Title', reactions: { '🔥': 99 }, updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Oversized Comment Content Rejection',
    operation: 'create',
    path: 'posts/post_1/comments/c_big',
    auth: { uid: 'player_uid', email: 'player@example.com', email_verified: true },
    payload: { id: 'c_big', postId: 'post_1', authorUid: 'player_uid', authorName: 'Player', content: 'x'.repeat(1500), createdAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Immutable authorUid Tampering on Post Update',
    operation: 'update',
    path: 'posts/post_1',
    auth: { uid: 'admin_uid', email: 'chautuan9461@gmail.com', email_verified: true },
    payload: { authorUid: 'new_owner', updatedAt: 'SERVER_TIME' },
    expected: 'PERMISSION_DENIED',
  },
];
