# Firestore / Firebase Typesense Search Extension ⚡ 🔍 

[![CircleCI](https://circleci.com/gh/typesense/firestore-typesense-search.svg?style=shield)](https://circleci.com/gh/typesense/firestore-typesense-search)

A Firebase extension to sync data from your Firestore collection to [Typesense](https://typesense.org/), 
to be able to do full-text fuzzy search on your Firestore data, with typo tolerance, faceting, filtering, sorting, curation, synonyms, geosearch and more.

This extension listens to your specified Firestore collection and syncs Firestore documents to Typesense 
on creation, updates and deletes. It also provides a function to help you backfill data.

**What is Typesense?**

If you're new to [Typesense](https://typesense.org), it is an open source search engine that is simple to use, run and scale, with clean APIs and documentation. Think of it as an open source alternative to Algolia and an easier-to-use, batteries-included alternative to ElasticSearch. Get a quick overview from [this guide](https://typesense.org/docs/guide).


## ⚙️ Usage

### 1. Setup Prerequisites

Before installing this extension, make sure that you have:

1. [Set up a Cloud Firestore database](https://firebase.google.com/docs/firestore/quickstart) in your Firebase project.
2. [Set up](https://typesense.org/docs/0.20.0/guide/install-typesense.html) a Typesense cluster 
  (on [Typesense Cloud](https://cloud.typesense.org) or Self-Hosted).
3. Set up a Typesense Collection either through the Typesense Cloud dashboard or 
  through the [API](https://typesense.org/docs/0.20.0/api/collections.html#create-a-collection).

### 2. Install the Extension 

You can install this extension either through the Firebase Web console or through the Firebase CLI.

##### Firebase Console

[![Install this extension in your Firebase project](https://www.gstatic.com/mobilesdk/210513_mobilesdk/install-extension.png "Install this extension in your Firebase project")][install-link]

[install-link]: https://console.firebase.google.com/project/_/extensions/install?ref=typesense/firestore-typesense-search

##### Firebase CLI

```bash
firebase ext:install typesense/firestore-typesense-search --project=[your-project-id]
```

Learn more about installing extensions in the Firebase Extensions documentation:

- [Console](https://firebase.google.com/docs/extensions/install-extensions?platform=console)
- [CLI](https://firebase.google.com/docs/extensions/install-extensions?platform=cli)

##### Syncing Multiple Firestore collections

You can install this extension multiple times in your Firebase project by clicking on the installation link above multiple times, and use a different Firestore collection path in each installation instance. [Here](https://github.com/typesense/firestore-typesense-search/issues/9#issuecomment-885940705) is a screenshot of how this looks.

### 3. Backfilling data (optional)

This extension only syncs data that was created or changed in Firestore, after it was installed. In order to backfill data that already exists in your Firestore collection to your Typesense Collection:

- Create a new Firestore collection called `typesense_sync` through the Firestore UI.
- Create a new document with the ID `backfill` and contents of `{trigger: true}`

This will trigger the backfill background Cloud function, which will read data from your Firestore collection and create equivalent documents in your Typesense collection.

## 🧾 Billing

To install an extension, your project must be on the [Blaze (pay as you go) plan](https://firebase.google.com/pricing).

- You will be charged a small amount (typically around $0.01/month) for the Firebase resources required by this extension (even if it is not used).
- This extension uses other Firebase and Google Cloud Platform services, which have associated charges if you exceed the service’s free tier:
    - Cloud Firestore
    - Cloud Functions (Node.js 14+ runtime. [See FAQs](https://firebase.google.com/support/faq#expandable-24))
- Usage of this extension also requires you to have a running Typesense cluster either on Typesense Cloud or some 
  self-hosted server. You are responsible for any associated costs with these services.


## 🎛️ Configuration Parameters

When you install this extension, you'll be able to configure the following parameters:

| Parameter | Description |
|-----------|-------------|
| Firestore Collection Path | The Firestore collection that needs to be indexed into Typesense. |
| Firestore Collection Fields | A comma separated list of fields that need to be indexed from each Firestore document. Leave blank to index all fields. |
| Typesense Hosts | A comma-separated list of Typesense Hosts. For single node clusters, a single hostname is sufficient. For multi-node Highly Available or SDN Clusters, please be sure to mention all hostnames. | 
| Typesense API Key | An Typesense API key with admin permissions. Click on "Generate API Key" in cluster dashboard in Typesense Cloud. |
| Typesense Collection Name | Typesense collection name to index data into. |
| Cloud Functions location | Where do you want to deploy the functions created for this extension? You usually want a location close to your database. For help selecting a location, refer to the [location selection guide](https://firebase.google.com/docs/functions/locations). |



## ☁️ Cloud Functions

* **indexToTypesenseOnFirestoreWrite:** A function that indexes data into Typesense when it's triggered by Firestore changes.

* **backfillToTypesenseFromFirestore:** A function that backfills data from a Firestore collection into Typesense, triggered when a Firestore document with the path `typesense_sync/trigger` has the contents of `backfill: true`.


## 🔑 Access Required

This extension will operate with the following project IAM roles:

* datastore.user (Reason: Required to backfill data from your Firestore collection into Typesense)

## Development Workflow

#### Run Emulator

```shell
npm run emulator
npm run typesenseServer
```

- Emulator UI will be accessible at http://localhost:4000.
- Local Typesense server will be accessible at http://localhost:8108

Add records in the Firestore UI and they should be created in Typesense.

#### Run Integration Tests

```shell
npm run test
```

#### Generate README

The Firebase CLI provides the following convenience command to auto-generate a README file containing content
pulled from extension.yaml file and PREINSTALL.md file:

```shell
firebase ext:info ./ --markdown > README.md
```

#### Publish Extension

- Update version number in extension.yaml
- Add entry to CHANGELOG.md
- 
    ```shell
    firebase ext:dev:publish typesense/firestore-typesense-search
    ```
- Create release in Github

## ℹ️ Support

Please open a Github issue or join our [Slack community](https://join.slack.com/t/typesense-community/shared_invite/zt-mx4nbsbn-AuOL89O7iBtvkz136egSJg).
