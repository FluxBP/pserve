# pserve
PermaServe is a Node application that retrieves, unpacks and serves content from an Antelope blockchain using [PermaStore](https://github.com/fcecin/pstore).

PermaServe can serve static websites that are stored as Brotli-compressed tar archives on a PermaStore contract. It cannot deal with any other kind of binary PermaStore file.

## Running PermaServe

```
npm install
node app.js
```

PermaServe uses ExpressJS. Open the ```app.js``` application for details and configuration options. 

## Uploading a website

To upload a website, you can use the included `storeos` Perl-script command-line tool (Linux only). You will still need `cleos` installed with the private key for the account that is going to pay for the upload already loaded in it.

In `storeos`, use the `websiteupload()` command to upload a local directory to a PermaStore file name.

The example below uses the `myaccountnam` blockchain account to upload the entire contents of directory `mylocal/directory` as a PermaStore file named `pagename`, which will be viewable by any PermaServe application server that is connected to the same blockchain and PermaStore contract. (Remember to open and unlock your cleos wallet first.)

```
storeos 'websiteupload("myaccountnam", "pagename", "mylocal/directory");'
```
