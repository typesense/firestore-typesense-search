# Search Firestore with Typesense

[![CircleCI](https://circleci.com/gh/typesense/firebase-typesense-search-extension.svg?style=shield)](https://circleci.com/gh/typesense/firebase-typesense-search-extension)

**Author**: Typesense (**[https://typesense.org](https://typesense.org)**)

**Description**: Indexes data from Firestore into Typesense for full-text search



**Details**: Use this extension to sync data from your Firestore collection to [Typesense](https://typesense.org/), to be able to 
do full-text fuzzy search on your Firestore data.

This extension listens to your specified Firestore collection and syncs Firestore documents to Typesense 
on creation, updates and deletes. It also provides a function to help you backfill data.

#### Additional setup

Before installing this extension, make sure that you have:

1. [Set up a Cloud Firestore database](https://firebase.google.com/docs/firestore/quickstart) in your Firebase project.
2. [Setup](https://typesense.org/docs/0.20.0/guide/install-typesense.html) a Typesense cluster 
  (on [Typesense Cloud](https://cloud.typesense.org) or Self-Hosted).
3. Setup a Typesense Collection either through the Typesense Cloud dashboard or 
  through the [API](https://typesense.org/docs/0.20.0/api/collections.html#create-a-collection).

This extension will sync changes that happen _after_ you've installed the extension. You'll be able to run a function 
to backfill existing data in your Firestore collection. Detailed information for running this backfill function 
will be provided after you install this extension.

#### Billing

To install an extension, your project must be on the [Blaze (pay as you go) plan](https://firebase.google.com/pricing)

- You will be charged a small amount (typically around $0.01/month) for the Firebase resources required by this extension (even if it is not used).
- This extension uses other Firebase and Google Cloud Platform services, which have associated charges if you exceed the service’s free tier:
    - Cloud Firestore
    - Cloud Functions (Node.js 14+ runtime. [See FAQs](https://firebase.google.com/support/faq#expandable-24))
- Usage of this extension also requires you to have a running Typesense cluster either on Typesense Cloud or some 
  self-hosted server. You are responsible for any associated costs with these services.




**Configuration Parameters:**

* Firestore Collection Path: The Firestore collection that needs to be indexed into Typesense.

* Firestore Collection Fields: A comma separated list of fields that need to be indexed from each Firestore document. Leave blank to index all fields.

* Typesense Hosts: A comma-separated list of Typesense Hosts. For single node clusters, a single hostname is sufficient. For multi-node Highly Available or SDN Clusters, please be sure to mention all hostnames.

* Typesense API Key: An Typesense API key with admin permissions. Click on "Generate API Key" in cluster dashboard in Typesense Cloud

* Typesense Collection Name: Typesense collection name to index data into

* Cloud Functions location: Where do you want to deploy the functions created for this extension? You usually want a location close to your database. For help selecting a location, refer to the [location selection guide](https://firebase.google.com/docs/functions/locations).



**Cloud Functions:**

* **indexToTypesenseOnFirestoreWrite:** A function that indexes data into Typesense when it's triggered by Firestore changes

* **backfillToTypesenseFromFirestore:** A function that backfills data from a Firestore collection into Typesense, triggered when a Firestore document with the path `typesense_sync/trigger` has the contents of `backfill: true`. The `backfill` key is deleted by the function, once the backfill is complete.



**Access Required**:



This extension will operate with the following project IAM roles:

* datastore.user (Reason: Required to backfill data from your Firestore collection into Typesense)

---

## 🧩 Install this extension

### Console

[![Install this extension in your Firebase project](https://www.gstatic.com/mobilesdk/210513_mobilesdk/install-extension.png "Install this extension in your Firebase project")][install-link]

[install-link]: https://console.firebase.google.com/project/_/extensions/install?ref=typesense/firestore-search-extension

### Firebase CLI

```bash
firebase ext:install typesense/firestore-search-extension --project=[your-project-id]
```

> Learn more about installing extensions in the Firebase Extensions documentation:
> [console](https://firebase.google.com/docs/extensions/install-extensions?platform=console),
> [CLI](https://firebase.google.com/docs/extensions/install-extensions?platform=cli)

---
