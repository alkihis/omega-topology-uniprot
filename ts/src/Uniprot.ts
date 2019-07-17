import nano, { MaybeDocument } from 'nano';
import fetch from 'node-fetch';

export enum CacheMode {
    object, couchdb
};

export default class Uniprot {
    static uniprot_api_url = "https://www.ebi.ac.uk/proteins/api/proteins";

    static requester: any;

    constructor(
        protected cache_mode: CacheMode,
        protected couch_url = "",
        protected dispatcher_url = ""
    ) { }

    ///// TODO TOCHANGE
    protected static cache: { [proteinAccessionNumber: string]: UniprotProtein } = {};

    async fetch(ids: string[], additionnals_parameters = {}) {
        const requests: Promise<UniprotProtein[]>[] = [];

        // Recherche dans le cache
        const idset = new Set(ids);
        const found: UniprotProtein[] = [];
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

        for (const [key, val] of Object.entries(additionnals_parameters as { [key: string]: string })) {
            parameters += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(val);
        }

        const CHUNK_SIZE = 75;

        for (let i = 0, j = ids.length; i < j; i += CHUNK_SIZE) {  
            const url = Uniprot.uniprot_api_url + "?size=-1&accession=" + ids.slice(i, i+CHUNK_SIZE).join(',') + parameters;

            requests.push(Uniprot.requester(
                url,
                {
                    headers: { 'Accept': 'application/json' }
                }
            )
            .then((r: Response) => r.json() as Promise<UniprotProtein[]>)
            .then((ps: UniprotProtein[]) => {
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

        return [].concat(...await Promise.all(requests)) as UniprotProtein[];
    }

    protected async bulkSave(prots: UniprotProtein[]) {
        console.log("saving")
        const document_name = 'uniprot';
        const nn = nano(this.couch_url);

        await nn.db.create(document_name).catch(() => {});
    
        const id_db = nn.use(document_name);
    
        let promises: Promise<any>[] = [];
        for (const protein of prots) {
            if (promises.length >= 100) {
                await Promise.all(promises);
    
                promises = [];
            }
    
            promises.push(
                id_db.insert(protein as MaybeDocument, protein.accession).catch(e => e)
                // .catch(foo => {
                //     return id_db.insert({ ...protein, _rev: foo.rev } as MaybeDocument, protein.accession)
                // })
            );
        }
    
        await Promise.all(promises);
    }

    protected async couchBulkGet(ids: string[]) : Promise<UniprotProtein[]> {
        return fetch(
            this.dispatcher_url + '/uniprot',
            {
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
                body: JSON.stringify({ keys: ids })
            }
        )
        .then(r => r.json())
        .then((data: any) => {
            // console.log(data);
            const results = data.request;
            return Object.values(results);
        });
    }

    makeShort(protein: UniprotProtein) : TinyProtein {
        const names = [];

        for (const n in protein.protein) {
            let val = protein.protein[n] as UniprotProteinNameObject | UniprotProteinNameObject[];
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
                let val = n[name_key] as UniprotValueEvidenceObject | UniprotValueEvidenceObject[];

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

    makeShortMany(proteins: UniprotProtein[]) {
        return proteins.map(p => this.makeShort(p));
    }

    makeGoTerms(protein: UniprotProtein) {
        const terms: GOTerms = {};

        for (const p of protein.dbReferences) {
            if (p.type === "GO") {
                terms[p.id] = p.properties as { term: string, source: string };
            }
        } 

        return terms;
    }

    makeGoTermsMany(proteins: UniprotProtein[]) {
        const proteins_map: { [proteinId: string]: GOTerms } = {};

        for (const p of proteins) {
            proteins_map[p.accession] = this.makeGoTerms(p);
        }

        return proteins_map;
    }
}

export interface GOTerms {
    [GoId: string]: GOTerm;
}

export interface GOTerm {
    term: string;
    source: string;
}

export interface TinyProtein {
    accession: string;
    id: string;
    protein_names: string[];
    gene_names: string[];
    created_at: string;
    modified_at: string;
    keywords: string[];
    organisms: string[];
}

export interface UniprotProtein {
    accession: string;
    id: string;
    proteinExistence: string;
    info: {
        type: string;
        created: string;
        modified: string;
        version: number;
    };
    organism: {
        taxonomy: number;
        names: { type: string, value: string }[];
        lineage: string[];
    };
    protein: {
        recommendedName?: UniprotProteinNameObject;
        alternativeName?: UniprotProteinNameObject[];
        submittedName?: UniprotProteinNameObject[];
    };
    gene: {
        name: UniprotValueEvidenceObject;
        olnNames: UniprotValueEvidenceObject[];
    }[];
    comments: {
        type: string;
        text?: {
            value: string;
            evidences?: UniprotEvidences;
        }[];
        reaction?: {
            name: string;
            dbReferences: UniprotDbReference[];
            ecNumber: string;
        };
        temperatureDependence: UniprotValueObject[];
    }[];
    features: {
        type: string;
        category: string;
        ftId?: string;
        description: string;
        begin: string;
        end: string;
        evidences?: UniprotEvidences;
    }[];
    dbReferences: UniprotDbReference[];
    keywords: UniprotValueObject[];
    references: {
        citation: {
            type: string;
            publicationDate: string;
            authors: string[];
            title?: string;
            publication: { submissionDatabase?: string, journalName?: string };
            location?: {
                volume: string;
                firstPage: string;
                lastPage: string;
            },
            dbReferences?: UniprotDbReference[];
        },
        source: {
            strain: UniprotValueObject[];
        },
        scope: string[];
    }[];
    sequence: [number, number, number, string, string] | {
        length: number,
        mass: number,
        modified: string,
        sequence: string,
        version: number
    };
}

interface UniprotValueObject { value: string }
interface UniprotValueEvidenceObject extends UniprotValueObject {
    evidences?: UniprotEvidences;
}
interface UniprotProteinNameObject {
    fullName: UniprotValueObject;
    ecNumber?: UniprotValueEvidenceObject[];
}
interface UniprotDbReference {
    type: string;
    id: string;
    properties?: {
        "molecule type"?: string;
        "protein sequence ID"?: string;
        "entry name"?: string;
        term?: string;
        source?: string;
        "match status"?: string;
    }
}
type UniprotEvidences = { code: string }[];