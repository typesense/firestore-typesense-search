const test = require('firebase-functions-test')({
  projectId: process.env.GCLOUD_PROJECT,
});

describe('Utils', () => {
  describe('typesenseDocumentFromSnapshot', () => {
    describe('when document fields are mentioned explicitly', () => {
      it('returns a Typesense document with only the specified fields', async () => {
        const typesenseDocumentFromSnapshot = (
          await import('../functions/src/utils.js')
        ).typesenseDocumentFromSnapshot;

        const documentSnapshot = test.firestore.makeDocumentSnapshot(
          {
            author: 'Author X',
            title: 'Title X',
            country: 'USA',
          },
          'id'
        );

        const result = await typesenseDocumentFromSnapshot(documentSnapshot);
        expect(result).toEqual({
          id: 'id',
          author: 'Author X',
          title: 'Title X',
        });
      });
    });

    describe('when no fields are mentioned explicitly', () => {
      it('returns a Typesense document with all fields', async () => {
        const typesenseDocumentFromSnapshot = (
          await import('../functions/src/utils.js')
        ).typesenseDocumentFromSnapshot;

        const documentSnapshot = test.firestore.makeDocumentSnapshot(
          {
            author: 'Author X',
            title: 'Title X',
            country: 'USA',
          },
          'id'
        );

        const result = await typesenseDocumentFromSnapshot(
          documentSnapshot,
          []
        );
        expect(result).toEqual({
          id: 'id',
          author: 'Author X',
          title: 'Title X',
          country: 'USA',
        });
      });
    });

    it('Can parse geopoint datatype', async () => {
      const typesenseDocumentFromSnapshot = (
        await import('../functions/src/utils.js')
      ).typesenseDocumentFromSnapshot;
      const data = [
        {
          location: {
            latitude: 1,
            longitude: 2,
          },
        },
        {
          location: {
            lat: 1,
            lng: 2,
          },
        },
        {
          location: {
            geohash: 'abc',
            latitude: 1,
            longitude: 2,
          },
        },
        {
          location: {
            geohash: 'abc',
            lat: 1,
            lng: 2,
          },
        },
      ];
      data.forEach(async (item) => {
        const documentSnapshot = test.firestore.makeDocumentSnapshot(
          item,
          'id'
        );
        const result = await typesenseDocumentFromSnapshot(
          documentSnapshot,
          []
        );
        expect(result).toEqual({
          id: 'id',
          location: [1, 2],
        });
      });
    });
  });
});
