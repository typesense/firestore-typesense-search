Use this extension to sync data from your Firestore collection to [Typesense](https://typesense.org/), to be able to 
do full-text fuzzy search on your Firestore data.

This extension listens to your specified Firestore collection and syncs Firestore documents to Typesense 
on creation, updates and deletes. It also provides a function to help you backfill data.

#### Additional setup

Before installing this extension, make sure that you have:

1. [Set up a Cloud Firestore database](https://firebase.google.com/docs/firestore/quickstart) in your Firebase project.
2. [Setup](https://typesense.org/docs/0.20.0/guide/install-typesense.html) a Typesense cluster 
  (on [Typesense Cloud](https://cloud.typesense.org) or a Self-Hosted server).
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
