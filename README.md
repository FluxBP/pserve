# pserve
PermaServe is a Node application that retrieves, unpacks and serves content from an Antelope blockchain using PermaStore.

PermaServe can serve static websites that are stored as Brotli-compressed tar archives on a PermaStore contract. It cannot deal with any other kind of binary PermaStore file.

## Running PermaServe

```
npm install
node app.js
```

PermaServe uses ExpressJS. Open the ```app.js``` application for details and configuration options. 
