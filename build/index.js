"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const commander_1 = __importDefault(require("commander"));
const Uniprot_1 = __importStar(require("./Uniprot"));
const https_proxy_agent_1 = __importDefault(require("https-proxy-agent"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const winston_1 = __importDefault(require("winston"));
commander_1.default
    .option('-p, --port [portNumber]', "Server port number", parseInt, 3289)
    .option('-c, --couchUrl [couchUrl]', "Couch DB URL", "")
    .option('-d, --dispatcherUrl [dispatcherUrl]', "Couch dispatcher URL", "")
    .option('-m, --mode [cacheMode]', "Cache mode [couch|native]", /^(couch|native)$/, 'native')
    .option('-x, --proxy [proxyUrl]', 'Proxy URL')
    .option('-l, --logLevel [logLevel]', 'Log level [debug|verbose|info|warn|error]', /^(debug|verbose|info|warn|error)$/, 'warn')
    .parse(process.argv);
exports.logger = winston_1.default.createLogger({
    level: 'warn',
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.simple())
        })
    ]
});
// Init request (for use in back, not needed when using in front)
Uniprot_1.default.requester = node_fetch_1.default;
if (commander_1.default.proxy) {
    const agent = new https_proxy_agent_1.default(commander_1.default.proxy);
    Uniprot_1.default.requester = (url, args) => {
        if (!args) {
            args = { agent };
        }
        else {
            args.agent = agent;
        }
        return node_fetch_1.default(url, args);
    };
}
const app = express_1.default();
app.use(express_1.default.json());
const uniprot = new Uniprot_1.default(commander_1.default.mode === 'couch' ? Uniprot_1.CacheMode.couchdb : Uniprot_1.CacheMode.object, commander_1.default.couchUrl, commander_1.default.dispatcherUrl);
app.use((_, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.post('/short', async (req, res) => {
    const ids = req.body.ids;
    if (!ids || !Array.isArray(ids)) {
        res.status(400).json({ error: "IDs must be sended as JSON, inside an array at key 'ids'." });
    }
    exports.logger.debug(`Request ${ids.level} ids`);
    const prots = await uniprot.fetch(ids);
    res.json(uniprot.makeShortMany(prots));
});
app.post('/go', async (req, res) => {
    const ids = req.body.ids;
    // console.log("Bulk request. Please wait...");
    if (!ids || !Array.isArray(ids)) {
        res.status(400).json({ error: "IDs must be sended as JSON, inside an array at key 'ids'." });
    }
    exports.logger.debug(`Request ${ids.level} ids`);
    const prots = await uniprot.fetch(ids);
    res.json(uniprot.makeGoTermsMany(prots));
});
app.post('/long', async (req, res) => {
    const ids = req.body.ids;
    if (!ids || !Array.isArray(ids)) {
        res.status(400).json({ error: "IDs must be sended as JSON, inside an array at key 'ids'." });
    }
    exports.logger.debug(`Request ${ids.level} ids`);
    const prots = await uniprot.fetch(ids);
    res.json(prots);
});
app.listen(commander_1.default.port, () => {
    console.log(`App listening on port ${commander_1.default.port}`);
});
