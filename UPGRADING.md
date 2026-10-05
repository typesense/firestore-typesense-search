# Upgrading to 4.0.0

Firebase Extensions shut down on **March 31, 2027**. After that date you can no longer update, reconfigure or export the
configuration of an installed extension. Version 4.0.0 of Firestore → Typesense Search is therefore no longer an
extension: it ships as a function kit, the npm package `typesense-firestore-search`, which you deploy into
your own Cloud Functions codebase. 3.0.0 is the last extension release.

`firebase ext:migrate` moves an installed extension to the function kit with the same configuration. It deploys the
kit next to the extension and only uninstalls the extension once you confirm, so syncing never stops.

## What changes

| | 3.x extension | 4.0.0 function kit |
|---|---|---|
| Installed with | Firebase Extensions | `firebase ext:migrate` or `firebase functions:kits:install` |
| Configuration | Extension params | Cloud Functions params in `function-kits/<kit>/config-<kit-instance-id>/.env.<project-id>` |
| Collection params | Single-collection params or collection list params | Collection list params only (see [step 1](#step-1-switch-to-the-collection-list-params)) |
| Function names | `ext-<instance-id>-indexOnWrite`, `ext-<instance-id>-backfill` | `kit-<kit-instance-id>-indexOnWrite`, `kit-<kit-instance-id>-backfill` |
| Typesense API key | Extension secret | The same Secret Manager secret, referenced from the `.env` file |
| Permissions | Granted by Firebase Extensions | A service account created for the kit, granted `roles/datastore.user`, `roles/eventarc.eventReceiver` and `roles/run.invoker` at deploy time |
| Backfill | Write `trigger: true` to `typesense_sync/backfill` | Unchanged |

## Before you start

1. Install firebase-tools 15.32.0 or later, and check the version:

   ```shell
   npm install -g firebase-tools@latest
   firebase --version
   ```

2. Find the instance ID of your extension (the `Instance ID` column) and its version:

   ```shell
   firebase ext:list --project <project-id>
   ```

3. Update the extension to 3.0.0 if it runs an older version. Step 1 needs 3.0.0:

   ```shell
   firebase ext:update <instance-id> typesense/firestore-typesense-search@3.0.0 --project <project-id>
   ```

## Step 1: Switch to the collection list params

Skip this step if your extension already uses `FIRESTORE_COLLECTION_PATHS` and `TYPESENSE_COLLECTION_NAMES`.

4.0.0 removes the single-collection params. `ext:migrate` copies each param under its own name, so switch to the list
params on the extension before migrating. 3.0.0 supports both, so nothing stops syncing while you do this.

Reconfigure the extension in the Firebase console (**Extensions** → your instance → **Manage** → **Reconfigure
extension**) or with:

```shell
firebase ext:configure <instance-id> --project <project-id>
```

Move each value to its list counterpart and clear the old param. A single collection is a list of one, so the values
stay the same:

| Remove                        | Set instead                        |
|-------------------------------|------------------------------------|
| `FIRESTORE_COLLECTION_PATH`   | `FIRESTORE_COLLECTION_PATHS`       |
| `TYPESENSE_COLLECTION_NAME`   | `TYPESENSE_COLLECTION_NAMES`       |
| `FIRESTORE_COLLECTION_FIELDS` | `FIRESTORE_COLLECTION_FIELDS_LIST` |
| `FLATTEN_NESTED_DOCUMENTS`    | `FLATTEN_NESTED_DOCUMENTS_LIST`    |

For example:

```dotenv
# Before
FIRESTORE_COLLECTION_PATH=books
TYPESENSE_COLLECTION_NAME=books
FIRESTORE_COLLECTION_FIELDS=title,author
FLATTEN_NESTED_DOCUMENTS=false

# After
FIRESTORE_COLLECTION_PATHS=books
TYPESENSE_COLLECTION_NAMES=books
FIRESTORE_COLLECTION_FIELDS_LIST=title,author
FLATTEN_NESTED_DOCUMENTS_LIST=false
```

If you skip this step, `ext:migrate` asks for the four list params in step 2 instead. Enter the values of the old params,
as in the table above.

## Step 2: Migrate

```shell
firebase ext:migrate --ext-instance <instance-id> --package typesense-firestore-search --project <project-id>
```

The command installs the kit, writes your extension's configuration to the kit's `.env` file and deploys the kit. The
extension keeps running while the kit is deployed. Answer its prompts as follows:

| Prompt | Answer |
|---|---|
| The extension is on version X, but the latest version is Y. Upgrade it now? | **Yes** if Y is newer than X, **No** if it is older |
| Are you sure you want to install the third-party kit `typesense-firestore-search`? | **Yes** |
| Kit name and instance name | Keep the defaults. The instance name defaults to the extension's instance ID |
| `FUNCTION_DEFAULT_REGION` | The same region as `LOCATION`, e.g. `us-central1` |
| This codebase uses declarative security. It will use the following role(s) | **Yes** |
| Uninstall it now? | **No**, until you have verified the kit in step 3 |

Do not pass `--force`: it accepts every prompt, including the version prompt and uninstalling the extension right
after the deploy, and the kit can take a few minutes to start receiving events.

## Step 3: Verify

1. List the kit's functions:

   ```shell
   firebase functions:list --project <project-id> | grep kit-
   ```

2. Create or update a document in one of your configured collections, then look for it in the kit's logs:

   ```shell
   firebase functions:log --only kit-<kit-instance-id>-indexOnWrite --project <project-id>
   ```

   Look for `Processing document in collection: <path> with ID: <document id>`.

While both are installed, the extension and the kit index every write. Upserts and deletes are idempotent, so this is
harmless, but it also means the Typesense collection cannot tell you which of the two worked. Use the logs.

## Step 4: Uninstall the extension

```shell
firebase ext:uninstall <instance-id> --project <project-id> --immediate
```

The kit keeps using the extension's Typesense API key secret; uninstalling the extension does not delete it.

## If the deploy fails

The extension is still installed and syncing. Fix the cause, then deploy the kit again:

```shell
firebase deploy --only functions:<kit-instance-id> --project <project-id>
```

If the failed deploy left the kit's functions behind in a broken state, the next deploy can fail with "Changing from an
HTTPS function to a background triggered function is not allowed". Delete them first:

```shell
firebase functions:delete kit-<kit-instance-id>-indexOnWrite kit-<kit-instance-id>-backfill --region <location> --project <project-id>
```

If the kit's `.env` file still sets only the single-collection params, the deploy fails with an error listing the lines
to add. Open `function-kits/<kit>/config-<kit-instance-id>/.env.<project-id>`, add them, delete the old
single-collection lines and deploy again.

Then continue with [step 3](#step-3-verify).

## Undo a migration

Reinstall the extension first; the kit's `.env` file has the values you need. Then uninstall the kit:

```shell
firebase functions:kits:uninstall --instance <kit-instance-id> --project <project-id>
```

Do not uninstall the kit before reinstalling the extension: uninstalling it deletes its `.env` file.

## Migrating after March 31, 2027

After the shutdown, the configuration of an extension can no longer be read. If you cannot migrate before then, save
it now:

```shell
firebase ext:export --mode functions --instance <instance-id> --project <project-id>
```

## New installs

Without an extension to migrate from, install the kit directly. The CLI prompts for each param:

```shell
firebase functions:kits:install --package typesense-firestore-search --project <project-id>
firebase deploy --only functions:<kit-instance-id> --project <project-id>
```
