const express = require('express')
const {MongoClient} = require("mongodb");
require('dotenv').config();

var router = express.Router()
const app = express()
const port = process.env.PORT

process.env.TEST
process.env.BAZARRA

app.listen(port, () => {
    console.log(`Project ${process.env.BAZARRA} listening on port ${port}`)
})

app.get('/', (req, res) => {
    res.send('Hello From Bazarra')
})

const uri = process.env.MONGODB;
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        await logDatabaseConnections(client)
        console.log("Connection Successful")
    } catch (e) {
        console.log('client database cluster connection failed')
        console.log(e.message)
    } finally {
        await client.close();
    }
}

run().catch(console.error)

async function logDatabaseConnections(client) {
    databaseConnections = await client.db().admin().listDatabases()

    console.log("Databases:");
    databaseConnections.databases.forEach(db => console.log(` - ${db.name}`));
}