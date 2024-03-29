# PermaServe

PermaServe is a sample Node application that retrieves, unpacks and serves content from an [Antelope](https://antelope.io) blockchain using [PermaStore](https://github.com/FluxBP/pstore).

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

## Connecting PermaServe to a specific Antelope blockchain

You have to edit the source files to point the code to the specific running blockchain that you are going to use. Search for `permastoreux`, `api.uxnetwork.io`, and `UX Network` across the project and change them to what you need.

## Future work

This is the V2 of the concept[^1]. Wish list for future versions:

* Asynchronous file IO
* UI/UX design
* Scalable webapp
* Better caching
* Easy deploy on clouds
* storeos download/upload commands that know how to resume broken operations
* Explicit file/page hierarchy support (partial with symlinks & dot file names)
* Web3 login allows you to manage your own pages
* Support multiple/all Antelope chains out-of-the-box
* Detect new content on chain and download automaticaly
* Thin header on top of each rendered page
* Long (string) page names
* Page name market
* AI detect bad content and filter (at the web cache level)
* IFPS or auxiliary P2P network storage for data (pay via blockchain)
* Charge for caching, serving and/or viewing pages (pay via blockchain)
* Dynamic pages, web applications, back-ends
* Download, upload, create, edit, manage pages from the web browser
* etc.

## Capybara

![Capybara](/favicon.ico "Caybara icon by Icons8.com")

[Capybara](https://icons8.com/icon/uoOWMrUsQgHs/capybara) icon by [Icons8](https://icons8.com)

[^1]: V1 was [Brocli](https://github.com/fcecin/brocli)/[GPPS](https://github.com/fcecin/gpps).
