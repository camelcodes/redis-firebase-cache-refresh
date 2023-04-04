const config = require('./config.json');

const createClient = require('redis').createClient;

const initializeApp = require('firebase/app').initializeApp;

const collection = require("firebase/firestore").collection;
const getFirestore = require("firebase/firestore").getFirestore;
const onSnapshot = require("firebase/firestore").onSnapshot;
const query = require("firebase/firestore").query;

console.log("Listening to updates...\n");

listenToFirebaseUpdates(getCacheProvider());

/**
 *
 * @returns Redis client instance
 */
function getCacheProvider() {

  console.log("Using redis cache")
  const cacheManager = createClient({
    socket: {
      reconnectStrategy() {
        console.log('Redis: reconnecting ', new Date().toJSON());
        return 5000;
      }
    },
    url: config.redisConnectionString, disableOfflineQueue: true
  })
  .on('ready', () => console.log('Redis: ready', new Date().toJSON()))
  .on('error', err => console.error('Redis: error', err, new Date().toJSON()));

  cacheManager.connect().then(() => {
    console.log('Redis Client Connected')
  }).catch(error => {
    console.error("Redis couldn't connect", error);
  })

  return cacheManager;
}

function buildCacheKeys(product_change_object) {
  // Always refresh the homepage
  const result = ["/"];

  // refresh shop details page
  if (product_change_object.owner) {
    result.push("/shop/" + product_change_object.owner);
  }
  // refresh product details page
  if (product_change_object.product_id) {
    result.push("/details/" + product_change_object.product_id);
  }
  return result;
}

/**
 *
 * @param cacheProvider Redis cache instance
 */
function listenToFirebaseUpdates(cacheProvider) {

  const cacheRefreshCollectionName = config.cacheRefreshCollectionName;

  const firebaseApp = initializeApp(config.firebase);
  const db = getFirestore(firebaseApp);
  const q = query(collection(db, cacheRefreshCollectionName));
  console.log("Fetching data from firebase: " + cacheRefreshCollectionName);

  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "modified") {
        const changeObject = change.doc.data();

        // Build the list of routes to be refreshed
        const cacheKeys = buildCacheKeys(changeObject);

        // For each route fetch teh page again to cache it
        cacheKeys.forEach(cacheKey => {
          console.log("Updating cache for route " + cacheKey);

          const url = config.appBaseUrl + cacheKey;
          console.log("Fetching data from URL: " + url)
          try {
            // Fetch the page using header Cache-control: no-cache
            // to avoid that the application returns a cached version
            fetch(url, {headers: {"cache-control": "no-cache"}})
            .then(response => {
              response.text().then(html => {

                console.log("data fetched, caching url: " + cacheKey)

                cacheProvider.set(cacheKey, html, 'EX', 300)
                .catch(err => console.log('Could not cache the request', err));
              })
            });
          } catch (error) {
            console.error("Error fetching data ", error);
          }
        })
      }
    });

  });
}
