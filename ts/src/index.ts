import express from 'express';
import commander from 'commander';
import Uniprot, { CacheMode } from './Uniprot';
import HttpsProxyAgent from 'https-proxy-agent';
import fetch from 'node-fetch';
import Winston from 'winston';

commander
    .option('-p, --port [portNumber]', "Server port number", parseInt, 3289)
    .option('-c, --couchUrl [couchUrl]', "Couch DB URL", "")
    .option('-d, --dispatcherUrl [dispatcherUrl]', "Couch dispatcher URL", "")
    .option('-m, --mode [cacheMode]', "Cache mode [couch|native]", /^(couch|native)$/, 'native')
    .option('-x, --proxy [proxyUrl]', 'Proxy URL')
    .option('-l, --logLevel [logLevel]', 'Log level [debug|verbose|info|warn|error]', /^(debug|verbose|info|warn|error)$/, 'warn')
.parse(process.argv);

export const logger = Winston.createLogger({
    level: 'warn',
    transports: [
        new Winston.transports.Console({
            format: Winston.format.combine(
                Winston.format.colorize(),
                Winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                Winston.format.errors({ stack: true }),
                Winston.format.splat(),
                Winston.format.simple(),
            )
        })
    ]
});

// Init request (for use in back, not needed when using in front)
Uniprot.requester = fetch;
if (commander.proxy) {
    const agent = new HttpsProxyAgent(commander.proxy);
    Uniprot.requester = (url: string, args?: { [argName: string]: any }) => {
        if (!args) {
            args = { agent };
        }
        else {
            args.agent = agent;
        }

        return fetch(url, args);
    }
}

const app = express();
app.use(express.json());

const uniprot = new Uniprot(commander.mode === 'couch' ? CacheMode.couchdb : CacheMode.object, commander.couchUrl, commander.dispatcherUrl);

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

    logger.debug(`Request ${ids.level} ids`);

    const prots = await uniprot.fetch(ids);
    res.json(uniprot.makeShortMany(prots));
});

app.post('/go', async (req, res) => {
    const ids = req.body.ids;

    // console.log("Bulk request. Please wait...");

    if (!ids || !Array.isArray(ids)) {
        res.status(400).json({ error: "IDs must be sended as JSON, inside an array at key 'ids'." });
    }

    logger.debug(`Request ${ids.level} ids`);

    const prots = await uniprot.fetch(ids);
    res.json(uniprot.makeGoTermsMany(prots));
});

app.post('/long', async (req, res) => {
    const ids = req.body.ids;

    if (!ids || !Array.isArray(ids)) {
        res.status(400).json({ error: "IDs must be sended as JSON, inside an array at key 'ids'." });
    }

    logger.debug(`Request ${ids.level} ids`);

    const prots = await uniprot.fetch(ids);
    res.json(prots);
});

app.listen(commander.port, () => {
    console.log(`App listening on port ${commander.port}`);
});
