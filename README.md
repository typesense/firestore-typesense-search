# Firestore / Firebase Typesense Search ⚡ 🔍 

A Firebase function kit to sync data from your Firestore collections to [Typesense](https://typesense.org/), 
to be able to do full-text fuzzy search on your Firestore data, with typo tolerance, faceting, filtering, sorting, curation, synonyms, geosearch and more.

The kit deploys Cloud Functions into your own project that listen to your specified Firestore collections and sync
Firestore documents to Typesense on creation, updates and deletes. It also provides a function to help you backfill data.

**What is Typesense?**

If you're new to [Typesense](https://typesense.org), it is an open source search engine that is simple to use, run and scale, with clean APIs and documentation. Think of it as an open source alternative to Algolia and an easier-to-use, batteries-included alternative to ElasticSearch. Get a quick overview from [this guide](https://typesense.org/docs/guide).

> [!NOTE]
> Up to version 3.x this was a Firebase extension. Firebase Extensions shut down on March 31, 2027, so 4.0.0 ships as
> a function kit, the npm package `typesense-firestore-search`. If you have the extension installed, follow
> [UPGRADING.md](UPGRADING.md).


## ⚙️ Usage

### Step 1️⃣ : Setup Prerequisites

Before installing the kit, make sure that you have:

1. [Set up a Cloud Firestore database](https://firebase.google.com/docs/firestore/quickstart) in your Firebase project.

   If using Google Workspace for Business, ensure that your default cloud compute based service account has the following roles (which can be found in the Google Cloud Console IAM section):
   
    * Artifact Registry Administrator
    * Artifact Registry Create-on-Push Writer
    * Artifact Registry Service Agent
    * Logs Writer
    * Storage Object Viewer
2. [Set up](https://typesense.org/docs/guide/install-typesense.html) a Typesense cluster on [Typesense Cloud](https://cloud.typesense.org) or [Self-Hosted](https://typesense.org/docs/guide/install-typesense.html#option-2-local-machine-self-hosting) (free).
3. Set up a Typesense Collection either through the Typesense Cloud dashboard or 
  through the [API](https://typesense.org/docs/latest/api/collections.html#create-a-collection).
4. Installed firebase-tools 15.32.0 or later (`npm install -g firebase-tools@latest`).

> [!IMPORTANT]
> ☝️ #3 above is a commonly missed step. The kit **does not create the Typesense Collection for you**. Instead it syncs data to a Typesense collection you've already created. If you see an HTTP 404 in the function logs, it's most likely because of missing this step. 

### Step 2️⃣ : Install the Kit 

From your Firebase project directory, install the kit. The CLI prompts for each of the
configuration parameters listed below and writes them to the kit's `.env` file:

```bash
firebase functions:kits:install --package typesense-firestore-search --project=[your-project-id]
```

Then deploy it:

```bash
firebase deploy --only functions:[kit-instance-id] --project=[your-project-id]
```

To change the configuration later, edit the kit's `.env` file and deploy again.

#### Syncing Multiple Firestore collections

One install can sync any number of Firestore collections, each into its own Typesense collection. List them in
`FIRESTORE_COLLECTION_PATHS` and `TYPESENSE_COLLECTION_NAMES` (same order), with optional per-collection settings in
`FIRESTORE_COLLECTION_FIELDS_LIST` and `FLATTEN_NESTED_DOCUMENTS_LIST`. Subcollection paths with placeholders such as
`users/{userId}/books` are supported; the placeholder values are added to each Typesense document.

#### 🎛️ Configuration Parameters

| Parameter                          | Description                                                                                                                                                                                                                                                                                    |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `LOCATION`                         | Where do you want to deploy the functions? You usually want a location close to your database. For help selecting a location, refer to the [location selection guide](https://firebase.google.com/docs/functions/locations).                                                                  |
| `FIRESTORE_DATABASE_REGION`        | Where the Firestore Database that holds the Firestore collections you want to sync into Typesense is located. Refer to the [Cloud Firestore locations guide](https://firebase.google.com/docs/firestore/locations).                                                                            |
| `DATABASE`                         | The Firestore database to sync from. Defaults to `(default)`.                                                                                                                                                                                                                                  |
| `FIRESTORE_COLLECTION_PATHS`       | Comma-separated list of Firestore collection paths to index, e.g. `users,users/{userId}/books`.                                                                                                                                                                                               |
| `TYPESENSE_COLLECTION_NAMES`       | Comma-separated list of Typesense collection names, in the same order as the Firestore collection paths (you need to create these collections in Typesense yourself).                                                                                                                          |
| `FIRESTORE_COLLECTION_FIELDS_LIST` | Pipe-separated list of comma-separated field lists, one per collection, e.g. `name,email|title`. Leave a list empty to index all fields of that collection.                                                                                                                                    |
| `FLATTEN_NESTED_DOCUMENTS_LIST`    | Comma-separated list of `true`/`false`, one per collection. Set `true` for Typesense Server v0.23.1 and below, since indexing nested objects is natively supported only in v0.24 and above.                                                                                                    |
| `TYPESENSE_HOSTS`                  | A comma-separated list of Typesense Hosts (only domain without https or port number). For single node clusters, a single hostname is sufficient. For multi-node Highly Available or (Search Delivery Network) SDN Clusters, please be sure to mention all hostnames in a comma-separated list. |
| `TYPESENSE_API_KEY`                | A Typesense API key with admin permissions. Click on "Generate API Key" in cluster dashboard in Typesense Cloud. Stored in Secret Manager.                                                                                                                                                      |
| `LOG_TYPESENSE_INSERTS`            | Should data inserted into Typesense be logged in Cloud Logging? This can be useful for debugging, but should not be enabled in production.                                                                                                                                                     |

> ⚠️ The kit connects to Typesense over HTTPS on port 443, since your data goes from Firebase to Typesense over the public internet and we want your data to be encrypted in transit.
For Typesense Cloud, HTTPS is already configured for you.
> 
> When self-hosting Typesense, you want to make sure you set `--api-port=443` and also get an SSL certificate from say [LetsEncrypt](https://letsencrypt.org/) or any registrar
and configure Typesense to use it using the `--ssl-certificate` and `--ssl-certificate-key` [server parameters](https://typesense.org/docs/latest/api/server-configuration.html).
> Alternatively, if you're running Typesense on your local machine, you can also set up a local HTTPS tunnel using something like [ngrok](https://ngrok.com/) (`ngrok http 8108`) and use the ngrok hostname in the kit configuration. 

##### Example

If you have a Firestore database called `(default)` with a collection inside it called `users` in the `nam5` region like this:

<img src="assets/firestore_db_example.png" alt="Firestore DB Example" width="800"/>

Here's the kit configuration, if you want to sync the `users` Firestore collection to Typesense:

```dotenv
LOCATION=us-central1
FIRESTORE_DATABASE_REGION=nam5
DATABASE=(default)
FIRESTORE_COLLECTION_PATHS=users
TYPESENSE_COLLECTION_NAMES=users
FIRESTORE_COLLECTION_FIELDS_LIST=
FLATTEN_NESTED_DOCUMENTS_LIST=false
TYPESENSE_HOSTS=xyz.a1.typesense.net
LOG_TYPESENSE_INSERTS=false
```

### Step 3️⃣ : [Optional] Backfill existing data

The kit only syncs data that was created or changed in Firestore after it was deployed. In order to backfill data that already exists in your Firestore collections to your Typesense Collections:

- Create a new Firestore collection called `typesense_sync` through the Firestore UI.
- Create a new document with the ID `backfill` and contents of `{trigger: true}`
- [Optional] If you sync [multiple collections](#syncing-multiple-firestore-collections), you can specify which particular collections are backfilled by setting the contents of the `backfill` document in the previous step to `{trigger: true, firestore_collections: ["path/to/firestore_collection_1", "path/to/firestore_collection_2"] }`

This will trigger the backfill background Cloud function, which will read data from your Firestore collection(s) and create equivalent documents in your Typesense collection.

> [!NOTE]
> The `backfill` function is deployed with the Cloud Functions default timeout of 540 seconds (9 minutes). If you're backfilling a large collection (e.g. hundreds of thousands of documents or more) and the function times out before finishing, you can increase the timeout up to 3600 seconds (1 hour) from the Google Cloud Console by editing the `backfill` Cloud Run service and bumping the request timeout.

## ☁️ Cloud Functions

* **indexOnWrite:** A function that indexes data into Typesense when it's triggered by Firestore changes.

* **backfill:** A function that backfills data from Firestore collections into Typesense, triggered when a Firestore document with the path `typesense_sync/backfill` has the contents of `trigger: true`.


## 🔑 Access Required

The kit's functions need the following project IAM role, which is granted to the functions' service account at deploy time:

* datastore.user (Reason: Required to backfill data from your Firestore collection into Typesense)

## 🧾 Billing

To deploy Cloud Functions, your project must be on the [Blaze (pay as you go) plan](https://firebase.google.com/pricing).

- The kit uses Firebase and Google Cloud Platform services, which have associated charges if you exceed the service’s free tier:
  - Cloud Firestore
  - Cloud Functions (Node.js 22 runtime)
  - Secret Manager
- Usage of the kit also requires you to have a running Typesense cluster either on Typesense Cloud or some
  self-hosted server. You are responsible for any associated costs with these services.


## Development Workflow

The functions are written in strict TypeScript (`functions/src`, compiled to `functions/lib`). The repo is a pnpm
workspace; dependencies younger than 7 days are refused (`minimumReleaseAge` in `pnpm-workspace.yaml`).

#### Setup

With Nix, `nix develop` provides Node 22, pnpm and Java (for the Firestore emulator). Otherwise install those yourself.
Docker is needed for the local Typesense server.

```shell
pnpm install
```

#### Checks

```shell
pnpm format        # oxfmt (pnpm format:check in CI)
pnpm typecheck     # tsc, strict
pnpm lint          # oxlint, type-aware
pnpm lint:guard    # rejects `any`, @ts-ignore/@ts-expect-error and lint-disable comments
```

#### Run Emulator

```shell
pnpm emulator
pnpm typesenseServer
```

- Emulator UI will be accessible at http://localhost:4000.
- Local Typesense server will be accessible at http://localhost:8108

Add records in the Firestore UI and they should be created in Typesense.

#### Run Tests

```shell
pnpm test:unit         # no emulator needed
pnpm test:integration  # builds, starts Typesense via docker compose if needed, runs each spec against the emulator
pnpm test              # both
```

The integration specs read their configuration from `test/integration/fixtures/*.env`.

#### Publish

- Update the version in `functions/package.json`
- Add entry to CHANGELOG.md
- Run `pnpm test`
- Build the package:

    ```shell
    pnpm pack:kit
    ```

  This writes `dist/package`: a clean build of `functions/` with README.md, CHANGELOG.md and UPGRADING.md, without
  dev dependencies, with `engines.node` relaxed to `>=22` (the kit wrapper runs on newer Node versions), and with an `npm-shrinkwrap.json` that pins the direct dependencies to the versions the tests ran
  against.
- Publish it (prereleases with `--tag next`):

    ```shell
    npm publish dist/package --tag next
    ```

- Create release in GitHub

## ℹ️ Support

Please read through the FAQ below, search through [past GitHub issues](https://github.com/search?q=repo%3Atypesense%2Ffirestore-typesense-search+repo%3Atypesense%2Ftypesense+firebase&type=issues), past threads in our [knowledge base](https://threads.typesense.org) and if you're unable to find an answer, please open a GitHub issue in this repo or join our [Slack community](https://join.slack.com/t/typesense-community/shared_invite/zt-2fetvh0pw-ft5y2YQlq4l_bPhhqpjXig) and ask there.

#### FAQs

- **My Typesense collection is empty, even after deploying the kit. What could be wrong?**

   The kit only syncs changes from your Firestore collections _from the time when it is deployed_. To backfill existing data from your Firestore collections into Typesense, you want to run the backfill step described [here](#step-3%EF%B8%8F⃣--optional-backfill-existing-data).

- **My Typesense collection is missing some records. What could be wrong?**

  This almost always is because the collection schema in Typesense does not match the structure of the documents in Firebase, and so Typesense is rejecting the documents due to validation failure.
  All validation errors returned by Typesense are logged in detail in the Cloud Functions logs, which are accessible via the Firebase web console. You want to search the logs for both the backfill function and also the indexOnWrite function.

- **The backfill function is not getting triggered. What could be wrong?**

  The backfill function watches for changes to a document with ID called `backfill`, in a Firestore collection called `typesense_sync`. This document should have a key called `trigger` with a boolean value of `true`. So if you've already created this key, you want to change its value to `false` and then change it back to `true` to re-trigger the backfill function.

- **How do I sync multiple collections?**

  List them all in one install. Read more [here](#syncing-multiple-firestore-collections)

- **How do I backfill just a single collection?**

  See the last bullet point under the backfilling instructions [here](#step-3%EF%B8%8F⃣--optional-backfill-existing-data)
