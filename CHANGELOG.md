## Version 4.0.0 (unreleased)

### Breaking

- Remove the single-collection params `FIRESTORE_COLLECTION_PATH`, `TYPESENSE_COLLECTION_NAME`, `FIRESTORE_COLLECTION_FIELDS` and `FLATTEN_NESTED_DOCUMENTS`. Move their values to `FIRESTORE_COLLECTION_PATHS`, `TYPESENSE_COLLECTION_NAMES`, `FIRESTORE_COLLECTION_FIELDS_LIST` and `FLATTEN_NESTED_DOCUMENTS_LIST`; see [UPGRADING.md](UPGRADING.md). If only the removed params are set, the deploy fails with an error listing the replacement lines
- `FIRESTORE_COLLECTION_PATHS` and `TYPESENSE_COLLECTION_NAMES` are now required
- Skip writes that change no indexed field. The indexed fields are the ones listed for the collection in `FIRESTORE_COLLECTION_FIELDS_LIST`, or every field when that list is empty. Such writes no longer read Firestore or reach Typesense, so writing a document without changing an indexed field ("touching" it) no longer resyncs it. Change an indexed field or run a backfill instead
- Check the collection params when `firebase deploy` loads the functions, so a mistake fails the deploy with the `.env` lines to change instead of failing every invocation. The check also rejects paths under `typesense_sync`, duplicate paths, document paths, repeated placeholders, field groups or `true` flatten values without a matching path, and flatten values other than `true` or `false`. It runs only when both `FIRESTORE_COLLECTION_PATHS` and `TYPESENSE_COLLECTION_NAMES` are set, so `firebase functions:kits:install` and `firebase deploy` can still prompt for a missing one. If a bad config still reaches a deployed function, for example through values typed at a deploy prompt, the function records it in `typesense_sync/issues/typesense_issues/config`, at most once every 10 minutes per instance, and skips writes until it is fixed
- Record documents that fail to index in `typesense_sync/issues/typesense_issues`. When Typesense rejects a document with a 4xx other than 408 or 429, the kit records an issue and the invocation succeeds, since a retry can't fix it. When Typesense can't be reached or fails with a 5xx, 408 or 429, the kit records an issue and still fails the invocation. The kit's functions don't retry, so run a backfill once Typesense is back
- Index a document only into the collection it is directly in. Since 3.0.0, writing a subcollection document such as `users/u1/books/b1` upserted it into the Typesense collection of a configured parent path (`users`) under its own ID, and deleting it deleted that ID from the parent's collection, even when `users/{userId}/books` was configured too. Subcollection documents are no longer indexed into a configured parent collection; configure the subcollection path to index them. Backfill of a path such as `users/{userId}/books` also skips same-named collections nested below it

### Changes

- Ship as a function kit, the npm package `typesense-firestore-search`, instead of a Firebase extension. Installed extensions move to it with `firebase ext:migrate`; 3.0.0 is the last extension release
- Rewrite the functions in strict TypeScript
- Declare every param as a Cloud Functions param with the same name as in the extension, so migrated installs keep their values
- Write each issue document with the Typesense collection, document path, failing stage, a message, the Typesense response, `lastSeenAt`, a `count` and an `expireAt` 30 days out for an optional TTL policy. Writing one costs a single Firestore write. Indexing the document successfully later doesn't remove it; a backfill does
- Backfill writes `typesense_sync/backfill_status` when it starts and when it ends, with read, indexed, excluded and failed counts per collection and the first 20 failures. The report includes per-document import errors, which were only logged before, and the reason for any request it rejects
- Backfill stops a collection at the first import request Typesense rejects with a 4xx other than 408 or 429, such as when the Typesense collection doesn't exist, instead of reading the rest of the Firestore collection
- When a backfill import request fails with a network error, a timeout, a 5xx, 408 or 429, the backfill stops that collection, finishes the others and writes its report, then fails the invocation. Trigger the backfill again once Typesense is back
- Reject a backfill request whose `firestore_collections` contains anything other than strings. Such entries used to be ignored
- Delete a document from Typesense when the re-read finds it was deleted after the write event. The invocation used to fail with `Document data is null`
- Use the Firestore document ID as the Typesense `id` even when the configured path has a placeholder named `{id}`. The placeholder's value used to replace it, so documents under different parents collided
- Create the Typesense client and parse the config once per function instance instead of on every invocation
- Treat deleting a document that is already missing from Typesense as success
- Backfill reads from the database set in `DATABASE` instead of always reading `(default)`
- Backfill no longer stops early when a page of a subcollection query contains documents outside the configured path
- Upgrade the Typesense client to v3
- Switch tooling to pnpm (with a 7-day minimum release age), oxlint, oxfmt and vitest, and add a Nix flake for the dev shell

## Version 3.0.0

- Add support for configuring multiple Firestore-to-Typesense collection mappings in a single extension install via `FIRESTORE_COLLECTION_PATHS` and `TYPESENSE_COLLECTION_NAMES`
- Add support for subcollection path patterns in multi-collection config, such as `users/{userId}/books`
- Add per-collection field filtering and flattening config via `FIRESTORE_COLLECTION_FIELDS_LIST` and `FLATTEN_NESTED_DOCUMENTS_LIST`
- Keep legacy single-collection params working for existing installs, but mark them as deprecated and log a warning when they are used
- Prefer the new multi-collection config when both legacy and new params are set, and fail installation on partial or inconsistent collection config

## Version 2.1.0

- Allow region configuration to be mutable

## Version 2.0.1

- Support for syncing data from sub-collections
- Use action=upsert for backfill
- Migrate to Firebase Functions V2 API
- Upgrade to Node 22
- Improvements to logging for debugging purposes
- Support for non-default databases
- [2.0.1] Fix for "Database does not exist in region" error during installation

## Version 2.0.0

- Support for syncing data from sub-collections
- Use action=upsert for backfill
- Migrate to Firebase Functions V2 API
- Upgrade to Node 22
- Improvements to logging for debugging purposes
- Support for non-default databases

## Version 1.5.0

- Use batching to back-fill, to prevent memory overflow when back-filling large collections
- Fix handling incorrect casting of nested objects into geopoints
- Allow specifying nested field names in list of fields to sync

## Version 1.4.1

- Only log error documents in backfill log

## Version 1.4.0

- Shorten function names to fix issue with local emulator

## Version 1.3.0

- Use `action=upsert` for back-filling data

## Version 1.2.0

- Upgrade to Node 18

## Version 1.1.0

- Add random jitter to retries to handle potential thundering herd issues for high volume writes.
- Upgrade to Node 16

## Version 1.0.3

- Fixed instructions in changelog 

## Version 1.0.2

- Publish to extension hub

## Version 1.0.1

- Re-order parameters to improve installation UX

## Version 1.0.0

- Adds a new parameter that controls whether a nested Firestore document is flattened by the extension, or sent as is to Typesense.
  - If you are running Typesense Server v0.23.1 or below, set "Flatten Nested Documents" to "Yes" (since indexing nested fields is not supported in these versions).
  - If you are running Typesense Server v0.24 or above, set "Flatten Nested Documents" to "No" (since indexing nested fields is natively supported in Typesense in these versions).
- Read the latest snapshot of the document on each write, to prevent sync consistency issues given Firestore's out-of-order change triggers. See #32.
- Update dependencies
- Handle special characters in document ID


## Version 1.0.0-rc.4

- Handle special characters in document ID

## Version 1.0.0-rc.3

- Update dependencies

## Version 1.0.0-rc.2

- Remove stale parameter.

## Version 1.0.0-rc.1

- Adds a new parameter that controls whether a nested Firestore document is flattened by the extension, or sent as is to Typesense.
  - If you are running Typesense Server v0.23.1 or below, set "Flatten Nested Documents" to "Yes" (since indexing nested fields is not supported in these versions).
  - If you are running Typesense Server v0.24 or above, set "Flatten Nested Documents" to "No" (since indexing nested fields is natively supported in Typesense in these versions).
- Read the latest snapshot of the document on each write, to prevent sync consistency issues given Firestore's out-of-order change triggers. See #32.

## Version 0.4.2

- Fix documentation for triggering backfill

## Version 0.4.1

- Use `for...of` instead of `forEach` in backfill function. #37

## Version 0.4.0

- Sync ref.path to Typesense
- Ability to backfill specific collections to Typesense, when multiple instances of the extension are installed.

## Version 0.3.0

- Map Firestore Timestamps to int64 values in Typesense
- Map Firestore GeoPoint values to Typesense geopoint format
- Flatten nested field values to top-level keys in Typesense

## Version 0.2.8

- Add default values to params, add links to external services needed for plugin

## Version 0.2.7

- Support for Typesense collection names with special characters like `/`

## Version 0.2.6

- Update dependencies, to handle import errors

## Version 0.2.5

- Increase memory for backfill function

## Version 0.2.4

- Increase connection timeout

## Version 0.2.3

- Fixes post installation instructions

## Version 0.2.2

- Fixes "Backfill function attempts to rerun admin.initializeApp on rerun"

## Version 0.2.1

- Add additional regions

## Version 0.2.0

- Initial public release
