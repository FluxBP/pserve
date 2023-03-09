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

// Generate info HTML pages
function info(pagename, big, m1, m2, retrysecs) {
    var hstart = `<tt><body bgcolor=#DDD><center><div align=center style="background-color:EEE;border:8px dashed pink;padding:1%;margin:100px;width:640px">`;
    var hbig = "<h2>" + big + "</h2>";
    var h1 = m1;
    var h2 = "";
    if (m2.length > 0) {
	h2 = "<BR><BR>" + m2;
    }
    var hpage = "<BR><BR>";
    if (pagename.length > 0) {
	hpage += "Page: <B>" + pagename + "</B> | ";
    }
    var hend = `<a href="/">Browse</a> | <a href="/_home">Home</a><BR><BR></DIV></center>`;
    var hretry = "";
    var hscript = "";
    if (retrysecs > 0) {
	hretry = "<BR><BR><a href=\"\">Try again</a> <font id=\"l\">in " + retrysecs + "s</font>";
	hscript = "<script>var s=" + retrysecs + ";var x=setInterval(function(){if(--s>0){t=\"in \"+s+\"s\";}else{t=\"\";clearInterval(x);}document.getElementById(\"l\").innerHTML=t;},1000);</script>";
    }
    return hscript + hstart + hbig + h1 + h2 + hretry + hpage + hend;
}

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
	res.send("Internal error.");
    }
});

// Default route: we don't have it

app.get("*", function (req, res) {
    res.status(404).send( info("", "404", "Not found", "<B>"+req.params[0]+"</B>", 0) );
});

// Start

app.listen(WEB_SERVER_PORT, function () {
    console.log('PermaServe running.');
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
	//return "Invalid page name (too long): " + pagename;
	return info("", "Invalid page name", "Valid page names have at most 12 characters", "", 0);
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
	var timediffms = new Date() - stats.mtime;
	const timehourms = 3600000;
	if (timediffms >= timehourms) {
	    fs.unlinkSync(pageMetaFile);
	    request_metadata = true;
	} else {
	    // Time left to metadata file refresh
	    var tleftsecs = ~~ ((timehourms - timediffms) / 1000);
	    // check if published. if not published, complain page not published, try again when metadata is old, end
	    var ms = fs.readFileSync(pageMetaFile, {encoding:'utf8', flag:'r'});
	    if (ms.includes('"published":0')) {
		//return "Page is not published. Get it published and try again in an hour.";
		return info(pagename, "Page is not published", "Make sure it is published and check back later", "", tleftsecs);
	    } else if (ms.includes('"published":1')) {
		// Published page. Keep going.
		// Read the top:### result from the metadata, which should be there. 
		var matchResult = ms.match(/"top":(\d+)/);
		if (matchResult == null || matchResult.length < 2) {
		    //return "ERROR: Broken page metadata file.";
		    return info(pagename, "Broken page metadata file", "Check back later", "", tleftsecs);
		}
		fileNodeTopVal = matchResult[1];
		if (fileNodeTopVal - 1 > NODE_RANGE_LIMIT) {
		    //return "Ignoring page with too many data nodes: " + fileNodeTopVal + " (limit: " + NODE_RANGE_LIMIT + ").";
		    return info(pagename, "Page is too large", "Node count: " + fileNodeTopVal + " | Limit: " + NODE_RANGE_LIMIT, "", 0);
		}
	    } else {
		// Nonexistent page (deleted within the 1-hour window; corner case).
		//return "Page '" + pagename + "' not found (probably deleted).";
		return info(pagename, "Page not found", "This page was likely deleted", "", 0);
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

    	//return "Requesting page metadata for page '" + pagename + "'. If it exists, try again in a minute.";
	return info(pagename, "Searching for page on blockchain...", "Requested page metadata", "If it exists, check back later", 60);
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
	//return "Downloading page '" + pagename + "' chunks (requested: " + requested + ", already got: " + found + "). Try again in a few minutes.";
	return info(pagename, "Downloading page from blockchain...", "Data nodes requested: " + requested + ", had " + found + "/" + fileNodeTopVal, "Please check back later", 30 + requested * 3);
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
	// I don't think this ever happens
	logError(pageDir, err);
	return "Error processing downloaded page: " + err;
    }

    //return "Downloaded page '"+ pagename +"' from the blockchain and attempted to unpack it. Reload this page to view the result.";
    return info(pagename, "Processing page...", "Decompressing " + fileNodeTopVal + " donwloaded page data nodes", "Please check back later", 30 + fileNodeTopVal * 3);
}
