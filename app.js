const express = require("express");
const B2 = require("backblaze-b2");
require("dotenv").config();
const app = express();

const b2 = new B2({
    applicationKeyId: process.env.APPLICATION_KEY_ID,
    applicationKey: process.env.APPLICATION_KEY,
});
const BUCKET_ID = process.env.BUCKET_ID;
const URL_PREFIX = process.env.URL_PREFIX;

const LISTEN_PORT = process.env.LISTEN_PORT;

async function b2FilenamesToLocal() {
    await b2.authorize(); // must authorize first (authorization lasts 24 hrs)
    let allFilenames = [];
    let nextFileName = "";
    while (nextFileName !== false) {
        const res = await b2.listFileNames({
            bucketId: BUCKET_ID,
            startFileName: nextFileName,
            maxFileCount: 10000,
            delimiter: "",
            prefix: ""
        });

        console.log(res.data.nextFileName)
        nextFileName = res.data.nextFileName;
        nextFileName = nextFileName ? nextFileName : false;

        allFilenames = allFilenames.concat(res.data.files);
    }
    return allFilenames;
}

function translateForJsTree(data) {
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
            "url": URL_PREFIX + encodeURIComponent(d.fileName),
            "id": name,
            "text": parents[parents.length - 1],
            "parent": parents.length == 1 ? "#" : parents.slice(0, parents.length - 1).join("/"),
        })
    }
    return res;
}

(async () => {
    let tree = null;

    app.get("/refresh", async(req, res) => {
        tree = null;
        res.redirect("/");
    });

    app.get("/tree.json", async (req, res) => {
        if (tree == null){
            let all_filenames = await b2FilenamesToLocal();
            tree = translateForJsTree(all_filenames)
        }
        res.json(tree);
    });
    
    app.use(express.static("public"));
    
    app.listen(LISTEN_PORT, function () {
        console.log(`listening on *:${LISTEN_PORT}`);
    });
})();