# omega-topology-uniprot

> Gives to omega-topology-graph needed UniProt informations, querying the UniProt-containing EBI REST API

Fetch UniProt data from the API, register them into a cache (JavaScript object or Couch database) from future requests.
This service expose endpoints used to fetch protein GO terms, or full protein information.

> This micro-service is an REST JSON API, responding ONLY to JSON formatted requests.

## Installation

```bash
git clone https://github.com/alkihis/omega-topology-uniprot.git
cd omega-topology-uniprot
npm i
```

## Starting the service
```bash
Usage: node build/index.js [options]

Options:
  -p, --port [portNumber]              Server port number (default: 3289)
  -c, --couchUrl [couchUrl]            Couch DB URL (default: "")
  -d, --dispatcherUrl [dispatcherUrl]  Couch dispatcher URL (default: "")
  -m, --mode [cacheMode]               Cache mode [couch|native] (default: "native")
  -x, --proxy [proxyUrl]               Proxy URL
```

- -p, --port &lt;portNumber&gt; : Port used by the micro-service to listen to request
- -c, --couchUrl &lt;couchUrl&gt; : Couch database url. The classic couch URL should be "http://localhost:5984" (needed to insert protein into Couch)
- -d, --dispatcherUrl &lt;dispatcherUrl&gt; : omegalomodb service URL. Classic URL should be "http://localhost:3280" (needed to fetch data from Couch)
- -m, --mode &lt;native | couch&gt; : Select which cache method should be choosen. By default, service will use a JS object. In order to use CouchDB, -c and -d should configured !
- -x, --proxy &lt;proxyUrl&gt; : Specify a proxy URL if the service is behind a proxy

```bash
# Example
# Run service using couchdb to cache protein informations
node build/index.js -c http://localhost:5984 -d http://localhost:3280 -m couch
```

## Available endpoints

All endpoints are CORS-ready.

All endpoints use JSON-formatted body in request. In order to use JSON in body, **don't forget to add header `Content-Type: application/json`** in your request !

All endpoints take a single argument inside a JSON-formatted body, named `ids`, who must be an array of `string`, representing the **UniProt accession number** of the proteins you want data from.

### POST /short
Fetch shorts protein data.

Returns an array inside a JSON-formatted body, containing `TinyProtein` objects.

- `@url` POST http://<µ-service-url>/short
- `@returns` `TinyProtein[]`

### POST /long
Fetch full protein data, containing all keys returned by the UniProt EBI REST API.

Returns an array inside a JSON-formatted body, containing `UniprotProtein` objects.

- `@url` POST http://<µ-service-url>/long
- `@returns` `UniprotProtein[]`

### POST /go
Fetch only the GO terms corresponding to a protein.

Returns an object inside a JSON-formatted body, containing `GOTerms` objects. `GOTerms` objects are indexed by accession number. `GOTerms` is a object that map a **GO id** to a `GOTerm` object. 

- `@url` POST http://<µ-service-url>/go
- `@returns` `{ [accessionNumber: string]: GOTerms }`

## Examples

### Get GO Terms
```bash
curl -H "Content-Type: application/json" -d '{"ids": ["P32913"]}' http://<µ-service-url>/go
```
```json
{
    "P32913":{
        "GO:0005829":{"term":"C:cytosol","source":"IEA:GOC"},
        "GO:0005768":{"term":"C:endosome","source":"IPI:SGD"},
        "GO:0030904":{"term":"C:retromer complex","source":"IMP:SGD"},
        "GO:0030905":{"term":"C:retromer, tubulation complex","source":"IPI:SGD"},
        "GO:0032266":{"term":"F:phosphatidylinositol-3-phosphate binding","source":"IDA:SGD"},
        "GO:0006886":{"term":"P:intracellular protein transport","source":"IBA:GO_Central"},
        "GO:0042147":{"term":"P:retrograde transport, endosome to Golgi","source":"IPI:SGD"}
    }
}
```

---

### Get short information about one or multiple proteins
```bash
curl -H "Content-Type: application/json" -d '{"ids": ["P32913"]}' http://<µ-service-url>/short
```
```json
[
    {
        "accession": "P32913",
        "created_at": "1993-10-01",
        "modified_at": "2019-05-08",
        "protein_names":[
            "Vacuolar protein sorting-associated protein 17",
            "Carboxypeptidase Y-deficient protein 21"
        ],
        "gene_names":["VPS17", "PEP21", "O3314", "YOR3314W", "YOR132W"],
        "keywords":["Coiled coil", "Complete proteome", "Membrane", "Phosphoprotein", "Protein transport", "Reference proteome", "Transport"],
        "organisms":[
            "Saccharomyces cerevisiae (strain ATCC 204508 / S288c)",
            "Baker's yeast"
        ]
    }
]
```

---

### Get all informations about one or multiple proteins
```bash
curl -H "Content-Type: application/json" -d '{"ids": ["P32913"]}' http://<µ-service-url>/long
```
```json
[
    {
        "accession": "P32913",
        "proteinExistence": "Evidence at protein level",
        "info": {
            "type": "Swiss-Prot",
            "created": "1993-10-01",
            "modified": "2019-05-08",
            "version": 166
        },
        "organism": {
            "taxonomy": 559292,
            "names": [
                {
                    "type": "scientific",
                    "value": "Saccharomyces cerevisiae (strain ATCC 204508 / S288c)"
                }
            ],
            "lineage": [
                "Eukaryota",
                "Fungi",
                "Dikarya",
                "Ascomycota",
                "Saccharomycotina",
                "Saccharomycetes",
                "Saccharomycetales",
                "Saccharomycetaceae",
                "Saccharomyces"
            ]
        },
        "protein": {
            "recommendedName": {
                "fullName": {
                    "value": "Vacuolar protein sorting-associated protein 17"
                }
            }
        },
        "gene": [
            {
                "name": {
                    "value": "VPS17"
                }
            }
        ],
        "comments": [
            {
                "type": "SUBUNIT",
                "text": [
                    {
                        "value": "Component of the retromer complex which consists of ...",
                        "evidences": [
                            ...
                        ]
                    }
                ]
            }
        ],
        "features": [
            {
                "type": "CHAIN",
                "category": "MOLECULE_PROCESSING",
                "ftId": "PRO_0000065892",
                "description": "Vacuolar protein sorting-associated protein 17",
                "begin": "1",
                "end": "551"
            }
        ],
        "dbReferences": [
            {
                "type": "EMBL",
                "id": "L02869",
                "properties": {
                    "molecule type": "Genomic_DNA",
                    "protein sequence ID": "AAA35213.1"
                }
            }
        ],
        "keywords": [
            {
                "value": "Coiled coil"
            }
        ],
        "references": [
            {
                "citation": {
                    "type": "journal article",
                    "publicationDate": "1993",
                    "title": "The yeast VPS17 gene encodes a membrane-associated ...",
                    "authors": [
                        "Koehrer K.",
                        "Emr S.D."
                    ],
                    ...
                },
                "scope": [
                    "NUCLEOTIDE SEQUENCE [GENOMIC DNA]"
                ]
            }
        ],
        "sequence": {
            "version": 2,
            "length": 551,
            "mass": 63204,
            "modified": "1997-11-01",
            "sequence": "MTSAVPYDPYDDLDNNPFAEPQEEDSEPAATTTDGSSSMSEERVGTEQTAASVQDN..."
        }
    }
]
```

## Interfaces
Types used in the package and documentation should be found in src/Uniprot.ts or in build/Uniprot.d.ts.

