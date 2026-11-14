# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Identity Integrity**: Users can only create their own `/users/{userId}` and `/users/{userId}/private/{docId}` documents where `userId == request.auth.uid`, and cannot self-assign elevated roles (`role` must be `'player'` on self-create).
2. **PII Isolation**: User emails and private streak dates live strictly under `/users/{userId}/private/{docId}`, readable and writable only by the owner or verified administrators (`chautuan9461@gmail.com` or `/admins/{uid}`).
3. **RBAC Authority**: Staff and Admin privileges for publishing/editing/deleting posts, songs, elements, ranks, and settings are derived exclusively from verified email (`email_verified == true`) and `/admins/{request.auth.uid}` or the bootstrapped admin email (`chautuan9461@gmail.com`).
4. **Master Gate & Relational Integrity**: Comments under `/posts/{postId}/comments/{commentId}` require the parent `/posts/{postId}` to exist and be `'published'`, and `comment.postId == postId` and `comment.authorUid == request.auth.uid`.
5. **Temporal Integrity**: Creation and update mutations enforce `request.time` server timestamps on `createdAt` and `updatedAt`.
6. **Strict Schema Keys & Boundaries**: Every entity enforces `keys().hasAll(...)`, `keys().hasOnly(...)`, type checks, string `.size()` bounds, bounded list sizes, and regex `^[a-zA-Z0-9_\-]+$` on all document IDs.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Role Escalation**: Creating `/users/u1` with `{ id: "u1", username: "hacker", role: "admin", createdAt: request.time, updatedAt: request.time }` -> `PERMISSION_DENIED`.
2. **Shadow Ghost Field Injection**: Creating `/posts/p1` with an extra undeclared field `{ ..., isVerified: true }` -> `PERMISSION_DENIED`.
3. **Email Spoofing**: Authenticating with `email: "chautuan9461@gmail.com"` and `email_verified: false` to create `/posts/p1` -> `PERMISSION_DENIED`.
4. **ID Poisoning**: Creating `/posts/..invalid$id!!` or a 500-char document ID -> `PERMISSION_DENIED`.
5. **Client Timestamp Forgery**: Creating `/posts/p1` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
6. **PII Blanket Read**: Non-owner user reading `/users/otherUser/private/info` -> `PERMISSION_DENIED`.
7. **Author Spoofing**: Creating `/posts/p1` with `authorUid: "someone_else"` != `request.auth.uid` -> `PERMISSION_DENIED`.
8. **Orphaned Comment**: Creating `/posts/nonexistent_post/comments/c1` -> `PERMISSION_DENIED`.
9. **Non-Staff Post Publish**: Regular `'player'` creating `/posts/p1` -> `PERMISSION_DENIED`.
10. **Value Poisoning**: Authenticated player updating `/posts/p1` `title` alongside `reactions` -> `PERMISSION_DENIED` (`affectedKeys().hasOnly(['reactions', 'updatedAt'])`).
11. **Oversized String Exhaustion**: Creating `/posts/p1/comments/c1` with a 5,000-character `content` string (>1000 max) -> `PERMISSION_DENIED`.
12. **Immutable Field Tampering**: Updating `/posts/p1` to change `authorUid` or `createdAt` -> `PERMISSION_DENIED`.
