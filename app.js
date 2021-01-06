const express = require("express");
const B2 = require("backblaze-b2");
require("dotenv").config();
const { promises: fs } = require("fs");
const app = express();

const b2 = new B2({
    applicationKeyId: process.env.APPLICATION_KEY_ID,
    applicationKey: process.env.APPLICATION_KEY,
});
const BUCKET_ID = process.env.BUCKET_ID;
const LOCAL_DB_FILE = "filenames.json";

const LOCAL_TREE_FILE = "public/tree.json";
const LISTEN_PORT = 8004;

async function b2FilenamesToLocal() {
    await b2.authorize(); // must authorize first (authorization lasts 24 hrs)
    let allFilenames = [];
    let nextFileName = "";
    while (nextFileName !== false) {
        const res = await b2.listFileNames({
            bucketId: BUCKET_ID,
            startFileName: nextFileName,
            maxFileCount: 1000,
            delimiter: "",
            prefix: ""
        });

        console.log(res.data.nextFileName)
        nextFileName = res.data.nextFileName;
        nextFileName = nextFileName ? nextFileName : false;

        allFilenames = allFilenames.concat(res.data.files);
    }
    await fs.writeFile(LOCAL_DB_FILE, JSON.stringify(allFilenames));
    return allFilenames;
}

async function translateForJsTree(data) {
    let res = [];
    for (let d of data) {
        if (!["audio/mpeg", "audio/ogg", "audio/flac", "audio/x-wav"].includes(d.contentType)) {
            continue
        }
        const name = d.fileName;
        const parents = name.split("/");
        for (let i = 0; i < parents.length - 1; i++) {
            const obj = {
                "id": parents.slice(0, i + 1).join("/"),
                "text": parents[i],
                "parent": i == 0 ? "#" : parents.slice(0, i).join("/")
            };
            if (!res.find(a => a.id == obj.id && a.parent == obj.parent)) {
                res.push(obj);
            }
        }
        res.push({
            "icon": "jstree-file",
            "id": name,
            "text": parents[parents.length - 1],
            "parent": parents.length == 1 ? "#" : parents.slice(0, parents.length - 1).join("/"),
        })
    }
    await fs.writeFile(LOCAL_TREE_FILE, JSON.stringify(res));
    return res;
}


let lastAuthorization = 0;
async function authorizeIfNeeded() {
    const now = Date.now();
    if (now - lastAuthorization > 3600000) {
        await b2.authorize();
        lastAuthorization = now;
    }
}

async function getFile(id) {
    await authorizeIfNeeded();
    return b2.downloadFileById({
        fileId: id,
        responseType: "stream", // options are as in axios: "arraybuffer", "blob", "document", "json", "text", "stream"
    });
}

(async () => {
    let DB = null;
    try {
        DB = JSON.parse(await fs.readFile(LOCAL_DB_FILE));
    } catch (err) {
        console.error(err);
        console.error("Unable to read or parse local file for DB. Query new from b2");
        DB = await b2FilenamesToLocal();
    }

    try {
        await fs.access(LOCAL_TREE_FILE)
    } catch (err) {
        console.error(err);
        console.error("Unable to access local tree file. Write new one.")
        await translateForJsTree(DB);
    }

    app.get("/file", async (req, res) => {
        console.log("Got a FILE request:", req.query);
        const found = DB.find(i => i.fileName == req.query.name);
        if (!found) {
            res.sendStatus(404);
        } else {
            let b2file = await getFile(found.fileId);
            res.writeHead(200, {
                "Content-Type": found.contentType,
                "Content-Length": found.contentLength
            });
            b2file.data.pipe(res);
        }
    });
    
    app.use(express.static("public"));
    
    app.listen(LISTEN_PORT, function () {
        console.log("listening on *:8004");
    });
})();