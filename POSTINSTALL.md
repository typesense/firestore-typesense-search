### Post-installation Notes

Now that you've installed the extension, changes from `${param:FIRESTORE_COLLECTION_PATH}` 
in your Firestore Database will be synced to the Typesense Collection `${param:TYPESENSE_COLLECTION_NAME}`
on `${param:TYPESENSE_HOSTS}`.

### Pre-requisites

As a reminder in case you haven't already done this, make sure that you have setup a Typesense Collection in one of the
following ways:

- Through the Typesense Cloud Dashboard or 
- Through the [API](https://typesense.org/docs/0.20.0/api/collections.html#create-a-collection).

This extension expects a Typesense Cloud collection to already be created and does not create it for you.

###  Backfilling Data

This extension only syncs data that was created or changed after it was installed.
In order to backfill data that already exists in your Firestore collection to your Typesense Collection:

1. Create a new Firestore collection called `typesense_sync` through the Firestore UI.
2. Create a new document with the ID `backfill` and contents of `{trigger: true}`

This will trigger the backfill background function, which will read data from your Firestore collection and
create equivalent documents in your Typesense collection. 

### See the Extension in Action

Try adding or updating a Firestore document in `${param:FIRESTORE_COLLECTION_PATH}` through the Firestore UI.
You should see the change reflected in your Typesense collection.

### Monitoring

As a best practice, you can [monitor the activity](https://firebase.google.com/docs/extensions/manage-installed-extensions#monitor) of your installed extension, including checks on its health, usage, and logs.
