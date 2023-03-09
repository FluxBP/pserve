# PermaServe

PermaServe is a Node application that retrieves, unpacks and serves content from an [Antelope](https://antelope.io) blockchain using [PermaStore](https://github.com/fcecin/pstore).

PermaServe can serve static websites that are stored as Brotli-compressed tar archives on a PermaStore contract. It cannot deal with any other kind of binary PermaStore file.

You can check out a running instance of PermaServe at [uxnet.work](https://uxnet.work).

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

## Connecting PermaServe to other Antelope blockchains

The default PermaServe implementation points to the PermaStore contract [permastoreux](https://explorer.uxnetwork.io/account/permastoreux) on the [UX Network](https://uxnetwork.io), and uses the blockchain API node https://api.uxnetwork.io. If you are going to use another blockchain and/or another PermaStore contract deployment, you have to edit pretty much all of the source files. Search for `permastoreux`, `api.uxnetwork.io`, and `UX Network` across the project and change them to what you need.

## Capybara

![Capybara](/favicon.ico "Caybara icon by Icons8.com")

[Capybara](https://icons8.com/icon/uoOWMrUsQgHs/capybara) icon by [Icons8](https://icons8.com)
