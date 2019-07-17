"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nano_1 = __importDefault(require("nano"));
const node_fetch_1 = __importDefault(require("node-fetch"));
var CacheMode;
(function (CacheMode) {
    CacheMode[CacheMode["object"] = 0] = "object";
    CacheMode[CacheMode["couchdb"] = 1] = "couchdb";
})(CacheMode = exports.CacheMode || (exports.CacheMode = {}));
;
class Uniprot {
    constructor(cache_mode, couch_url = "", dispatcher_url = "") {
        this.cache_mode = cache_mode;
        this.couch_url = couch_url;
        this.dispatcher_url = dispatcher_url;
    }
    async fetch(ids, additionnals_parameters = {}) {
        const requests = [];
        // Recherche dans le cache
        const idset = new Set(ids);
        const found = [];
        ids = [];
        if (this.cache_mode === CacheMode.object) {
            for (const i of idset) {
                if (i in Uniprot.cache) {
                    found.push(Uniprot.cache[i]);
                }
                else {
                    ids.push(i);
                }
            }
        }
        else if (this.cache_mode === CacheMode.couchdb && this.dispatcher_url) {
            console.log("Bulking from couch");
            found.push(...await this.couchBulkGet([...idset]));
            for (const p of found) {
                idset.delete(p.accession);
            }
            // Recherche quand même depuis l'objet, si jamais...
            for (const i of idset) {
                if (i in Uniprot.cache) {
                    found.push(Uniprot.cache[i]);
                }
                else {
                    ids.push(i);
                }
            }
        }
        else {
            ids = [...idset];
        }
        requests.push(Promise.resolve(found));
        let parameters = "";
        for (const [key, val] of Object.entries(additionnals_parameters)) {
            parameters += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(val);
        }
        const CHUNK_SIZE = 75;
        for (let i = 0, j = ids.length; i < j; i += CHUNK_SIZE) {
            const url = Uniprot.uniprot_api_url + "?size=-1&accession=" + ids.slice(i, i + CHUNK_SIZE).join(',') + parameters;
            requests.push(Uniprot.requester(url, {
                headers: { 'Accept': 'application/json' }
            })
                .then((r) => r.json())
                .then((ps) => {
                console.log(`Fetched: ${i}-${Math.min(i + CHUNK_SIZE, ids.length)} / ${j}`);
                // Sauvegarde quand même dans le cache si il y a de la place
                if (Object.keys(Uniprot.cache).length < 4000) {
                    for (const protein of ps) {
                        Uniprot.cache[protein.accession] = protein;
                    }
                }
                if (this.cache_mode === CacheMode.couchdb && this.couch_url) {
                    // N'attends pas, sauvegarde en parallèle
                    this.bulkSave(ps);
                }
                return ps;
            }));
        }
        return [].concat(...await Promise.all(requests));
    }
    async bulkSave(prots) {
        console.log("saving");
        const document_name = 'uniprot';
        const nn = nano_1.default(this.couch_url);
        await nn.db.create(document_name).catch(() => { });
        const id_db = nn.use(document_name);
        let promises = [];
        for (const protein of prots) {
            if (promises.length >= 100) {
                await Promise.all(promises);
                promises = [];
            }
            promises.push(id_db.insert(protein, protein.accession).catch(e => e)
            // .catch(foo => {
            //     return id_db.insert({ ...protein, _rev: foo.rev } as MaybeDocument, protein.accession)
            // })
            );
        }
        await Promise.all(promises);
    }
    async couchBulkGet(ids) {
        return node_fetch_1.default(this.dispatcher_url + '/uniprot', {
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            body: JSON.stringify({ keys: ids })
        })
            .then(r => r.json())
            .then((data) => {
            // console.log(data);
            const results = data.request;
            return Object.values(results);
        });
    }
    makeShort(protein) {
        const names = [];
        for (const n in protein.protein) {
            let val = protein.protein[n];
            if (!Array.isArray(val)) {
                val = [val];
            }
            for (const name of val) {
                if (name.fullName) {
                    names.push(name.fullName.value);
                }
            }
        }
        const genes = [];
        for (const n of protein.gene) {
            for (const name_key in n) {
                let val = n[name_key];
                if (!Array.isArray(val)) {
                    val = [val];
                }
                for (const name of val) {
                    if (name.value) {
                        genes.push(name.value);
                    }
                }
            }
        }
        return {
            accession: protein.accession,
            id: protein.id,
            created_at: protein.info.created,
            modified_at: protein.info.modified,
            protein_names: names,
            gene_names: genes,
            keywords: protein.keywords.map(e => e.value),
            organisms: protein.organism.names.map(n => n.value)
        };
    }
    makeShortMany(proteins) {
        return proteins.map(p => this.makeShort(p));
    }
    makeGoTerms(protein) {
        const terms = {};
        for (const p of protein.dbReferences) {
            if (p.type === "GO") {
                terms[p.id] = p.properties;
            }
        }
        return terms;
    }
    makeGoTermsMany(proteins) {
        const proteins_map = {};
        for (const p of proteins) {
            proteins_map[p.accession] = this.makeGoTerms(p);
        }
        return proteins_map;
    }
}
Uniprot.uniprot_api_url = "https://www.ebi.ac.uk/proteins/api/proteins";
///// TODO TOCHANGE
Uniprot.cache = {};
exports.default = Uniprot;
