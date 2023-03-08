/*

  PermaServe
  
  A sample NodeJS web application that retrieves, caches and serves PermaStore
  pages from a PermaStore smart contract on an Antelope blockchain.
  
  PermaStore files are all interpreted by PermaServe as brotli-compressed tar
  archives. If PermaServe cannot unpack a PermaStore file in that way (becase it
  is not actually a Brotli-compressed tar archive) then PermaServe will just log
  errors to a "PermaServe.ERROR" file that can be viewed.

*/

// Config
const WEB_SERVER_PORT = 57057;
const NODE_RANGE_LIMIT = 1024;
const PERMA_STORE_SMART_CONTRACT_ACCOUNT_NAME = 'permastoreux';  // A PermaStore deployment on UX Network
const ANTELOPE_API_NODE = 'https://api.uxnetwork.io';            // 0rigin - UX Network

const { Api, JsonRpc, RpcError } = require('eosjs');
const { TextEncoder, TextDecoder } = require('util');

//const fetch = require('node-fetch');
//import fetch from "node-fetch";
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Express
var express = require('express');
var app = express();

// Misc
const fs = require('fs');
const zlib = require('zlib');
const tar = require('tar-fs');
const multi = require('multistream');
const serveIndex = require('serve-index');

// Blockchain API node connection
const rpc = new JsonRpc(ANTELOPE_API_NODE, { fetch });

// Debug: catch everything
//process.on('uncaughtException', function (err) {
//  console.error(err);
//});

// Hex string converter
const fromHexString = (hexString) =>
  Uint8Array.from(hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));

// Make sure data directories exist (not sure this is actually needed)
fs.mkdirSync("pages", { recursive: true });
fs.mkdirSync("nodes", { recursive: true });

// Webserver routing

// Root dir browses (views) the blockchain node cache
const path = require('path')
app.use('/', express.static(path.join(__dirname, 'pages')))

// =============================================================================
// NOTE:
// This is a TLS (HTTPS) setup hack template that can help your webserver
//   answer to Certbot / ACME / Let's Encrypt challenges that are made
//   during automated TLS setup. I have used this specifically in an
//   environment where the app server is installed in a certain directory,
//   and I have to go back ".." and enter "public" to find the ".well-known"
//   directory that is supposed to be served as "www.yourdomain.com/.well-known"
//   to the external challenges. Change it to suit your needs.
// This actual app.js server app does not include any NodeJS TLS/HTTPS support
//   because in the environment I have published this, that support is provided
//   by the proxy server that sits between this app server and the 'net. 
// =============================================================================
//app.get('/.well-known(/*)', function (req, res) {
//      var mypath = path.join(__dirname, '../public/.well-known/');
//      res.sendFile(req.params[0], { root: mypath });
//});
// =============================================================================

// /_home serves the static home dir
app.use('/_home', express.static(path.join(__dirname, 'home')))

// generates debug pages for files inside of _nodes/ and _pages/
function serve_debug(rootdir, req, res) {
    var pn = req.params.pagename;
    var fn = req.params.filename;
    var s = "<tt>Page: " + pn + "<br>";
    s += "File: " + fn + "<br><br>";
    var fp = rootdir + '/' + pn + '/' + fn;
    if (fs.existsSync(fp)) {
	var st = fs.statSync(fp);
	s += "Stat: " + JSON.stringify(st) + "<br><br>";
	if (fn.includes('PermaServe.')) {
	    s += "Content:<br><br>";
	    try {
		s += fs.readFileSync(fp);
	    } catch (err) {
		s += err;
	    }
	}
    }
    res.send(s);
}

// /_nodes allows browsing of the node cache for each page/file 
app.use('/_nodes', serveIndex(path.join(__dirname, 'nodes'),
			{'icons': true,
			 'template': 'nodestemplate.html'
			}
));

app.get('/_nodes/:pagename/:filename', function (req, res) {
    serve_debug('nodes', req, res);
});

// /_pages allows debugging pages directories without viewing page content 
app.use('/_pages', serveIndex(path.join(__dirname, 'pages'),
			{'icons': true,
			 'template': 'pagestemplate.html'
			}
));

app.get('/_pages/:pagename/:filename', function (req, res) {
    serve_debug('pages', req, res);
});

// When no index.html or specific file, display directory
app.use('/', serveIndex(path.join(__dirname, 'pages'),
			{'icons': true,
			 'template': 'template.html'
			}
));

app.listen(WEB_SERVER_PORT, function () {
    console.log('PermaServe running.');
});

// Dynamic routes (also exceptions that will shadow nodes):

// Accessing a root entry that isn't satisfied by the static router.
// All the root requests are interpreted as directory names that should
//   exist, as our webserver file root (pages/) does not store any files.
//   If the static router doesn't trigger, then the (what is to be a
//   directory name) is sent here as req.params.pagename.

app.get('/:pagename', function (req, res) {

    // I think this is the only specific root file that gets asked about
    //   and that we actually need to have. The rest can bomb as failed
    //   blockchain website requests.
    if (req.params.pagename == "favicon.ico") {
	res.sendFile(req.params.pagename, { root: __dirname });
	return;
    }

    // this is what we came here for: serve a named blockchain website.
    // this won't serve the website itself -- that's for the static router --
    //   but rather do some work (e.g. download the blockchain website)
    //   and then display some message like "ok we did it, reload the page".
    var s = serve_permastore_page(req, res);
    if (s != null) {
	res.send(s);
    } else {
	res.send("Null.");
    }
});

// This takes care of retrieving and caching binary nodes from chain RAM.
// This is called after we know the page entry for the nodes already exists
//   and is (probably) published.
// Returns true if the node file is present.
// Returns false if the node file is absent and we just requested the node.

function check_node (pagename, node) {

    // if node file does not exist inside pageNode dir
    //   (name is just the node number):
    //
    //   ask chain for that node. if error, return "blockchain API read error"
    //   if node does not exist, return error "non-existent node"
    //   if zero or more bytes set for the node, extract data and
    //     save binary file (name of file is the node number)
    //   if any other error, return that

    var nodeFile = 'nodes/' + pagename + '/' + node + ".bin";
    if (! fs.existsSync(nodeFile)) {	
	(async () => {
	    try {
		var result = await rpc.get_table_rows({
		    json: true,
		    code: PERMA_STORE_SMART_CONTRACT_ACCOUNT_NAME,
		    scope: pagename,
		    table: 'nodes',
		    lower_bound: node,
		    upper_bound: node,
		    limit: 1,
		    reverse: false,
		    show_payer: false,
		});

		if (result.hasOwnProperty("rows")
		    && result.rows.length > 0
		    && result.rows[0].hasOwnProperty("data"))
		{
		    const byteArray = fromHexString( result.rows[0].data );
		    fs.writeFileSync(nodeFile, byteArray,
				     {
					 flag: "wx",
					 mode: 0o644
				     });

		} else {
		    // Nonexistent node. Might exist in the future. Do nothing.
		}

	    } catch (err) {
		// If an error occurs, there's nothing we can do
		//   that can make anything better.
	    }
	})();

	return false;	
    }

    // File exists. Caller can attempt to read it.
    return true;
}

// Log page stream/unpacking errors to PermaServe.ERROR

function logError(dir, err) {
    console.log("error dir: " + dir );
    console.log("error msg: " + err );
    try {
	// Save nodes/pagename/metadata file
	fs.writeFileSync(dir + 'PermaServe.ERROR', err.toString() + "\r\n",
			 {
			     flag: "a+",
			     mode: 0o644
			 });
    } catch (writeError) {
	// Doesn´t matter.
    }
}

// Serve /pagename.
// This only is called when the /pages/pagename directory does not exist yet,
//   otherwise the static router will pick up the route instead.

function serve_permastore_page  (req, res) {
    
    // sanitize pagename
    var pagename = req.params.pagename;
    if (pagename.length > 12) {
	return "Invalid page name (too long): " + pagename;
    }
    
    // we will only create a node dir for the pagename if the pagename (filename) exists
    var pageNodeDir = 'nodes/' + pagename + '/';
    var pageDirExists = fs.existsSync(pageNodeDir);

    // this will save the top (node count) value from reading the page metadata file (if it is found and read)
    var fileNodeTopVal = null;
    
    // Checking for a published page:
    //
    // search for page metadata JSON response file -- in nodes/pagename (PermaServe.PAGE)
    var request_metadata = false;
    var pageMetaFile = pageNodeDir + 'PermaServe.PAGE';
    if (pageDirExists && fs.existsSync(pageMetaFile)) {
	// if file is too old (1 hour), delete it, then request new metadata, end
	var stats = fs.statSync(pageMetaFile);
	if (new Date() - stats.mtime >= 3600000) {
	    fs.unlinkSync(pageMetaFile);
	    request_metadata = true;
	} else {
	    // check if published. if not published, complain page not published, try again when metadata is old, end
	    var ms = fs.readFileSync(pageMetaFile, {encoding:'utf8', flag:'r'});
	    if (ms.includes('"published":0')) {
		return "Page is not published. Get it published and try again in an hour.";
	    } else if (ms.includes('"published":1')) {
		// Published page. Keep going.
		// Read the top:### result from the metadata, which should be there. 
		var matchResult = ms.match(/"top":(\d+)/);
		if (matchResult == null || matchResult.length < 2) {
		    return "ERROR: Broken page metadata file.";
		}
		fileNodeTopVal = matchResult[1];
		if (fileNodeTopVal - 1 > NODE_RANGE_LIMIT) {
		    return "Ignoring page with too many data nodes: " + fileNodeTopVal + " (limit: " + NODE_RANGE_LIMIT + ").";
		}
	    } else {
		// Nonexistent page (deleted within the 1-hour window; corner case).
		return "Page '" + pagename + "' not found (probably deleted).";
	    }
	}
    } else {
	// request new metadata, end
	request_metadata = true;
    }

    // If we have to request metadata
    if (request_metadata) {
	
	(async () => {
	    try {
		var result = await rpc.get_table_rows({
		    json: true,
		    code: PERMA_STORE_SMART_CONTRACT_ACCOUNT_NAME,
		    scope: pagename,
		    table: 'files',
		    limit: 1,
		    reverse: false,
		    show_payer: false,
		});

		// Proceed only if the filename exists in the smart contract.
		// Otherwise it is a bogus/spam request, so don't even
		//   create the filename dir for nodes.
		if (result.hasOwnProperty("rows") && result.rows.length > 0) {

		    // Create nodes/pagename dir
		    if (! pageDirExists) {  // even if dir already exists, it's fine.
			fs.mkdirSync(pageNodeDir, { recursive: true });
		    }

		    // Save nodes/pagename/metadata file
		    fs.writeFileSync(pageMetaFile, JSON.stringify(result),
				     {
					 flag: "wx",
					 mode: 0o644
				     });
		} else {
		    // Nonexistent filename. Might exist in the future. Do nothing.
		}

	    } catch (err) {
		// If an error occurs, there's nothing we can do
		//   that can make anything better.
	    }
	})();

    	return "Requesting page metadata for page '" + pagename + "'. If it exists, try again in a minute.";
    }

    // Loop through check_node from 0 to metadata.top-1
    // if 1+ requests made, print tally (not msgs from each try) and quit
    var requested = 0;
    var found = 0;
    for (let i = 0; i < fileNodeTopVal; i++) {
	if (check_node ( pagename, i )) {
	    found++;
	} else {
	    requested++;
	}
    }
    if (requested > 0) {
	return "Downloading page '" + pagename + "' chunks (requested: " + requested + ", already got: " + found + "). Try again in a few minutes.";
    }

    // We already have all the data nodes of a (hopefully) published page.
    // All that's left now is to unpack the data, and we are forever done with this page.
    // It becomes a static asset to serve.
    
    // Create pages/<pagename>, which will ensure the static router takes over for this route ("/pagename"),
    //   regardless of whether the next operations amount to anything useful.
    var pageDir = 'pages/' + pagename + '/';
    if (! fs.existsSync(pageDir)) {
	fs.mkdirSync(pageDir, { recursive: true });
    }

    // Unpack data nodes into the page data
    // If it errors out at any point, append the error message to the pages/pagename/PermaServe.ERROR file.
    try {
	// All binary node files are combined into one large input multistream
	var istreams = [];
	for (let i = 0; i < fileNodeTopVal; i++) {
	    istreams.push( fs.createReadStream(pageNodeDir + '/' + i + '.bin') );
	}
	
	// Here's a brotli decompressor stream
	const brotli = zlib.createBrotliDecompress();
	
	// Pipe the multistream into brotli decompress into tar decompress into the page directory
	var firstErr = null;
	var multistream = new multi( istreams )
	    .on('error', function(e){logError(pageDir, e);})
	    .pipe( brotli )
	    .on('error', function(e){logError(pageDir, e);})
	    .pipe( tar.extract( pageDir ) )
	    .on('error', function(e){logError(pageDir, e);})
	    ;

    } catch (err) {
	logError(pageDir, err);
	return "Error processing downloaded page: " + err;
    }

    return "Downloaded page '"+ pagename +"' from the blockchain and attempted to unpack it. Reload this page to view the result.";
}
