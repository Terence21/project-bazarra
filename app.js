const express = require('express')
const { MongoClient } = require("mongodb");
require('dotenv').config();

var router = express.Router()
const app = express()
const port = process.env.PORT

process.env.TEST // "TEST"
process.env.BAZARRA // "BAZARRA"

app.listen(port, () => {
    console.log(`Project ${process.env.BAZARRA} listening on port ${port}`)
})

app.get('/', (req, res) => {
    res.send('Hello From Bazarra')
})

// Replace the uri string with BAZ MongoDB deployment's connection env variable.
const uri = process.env.MONGODB;
const client = new MongoClient(uri);

async function run() {
    try {
      await client.connect();
    } catch{
        console.log('client database cluster connection failed')
    } 
    finally {
        // Ensures that the client will close when you finish/error
        await client.close();
    }
}
run().catch(console.error)

async function logDatabaseConnections(client){
    databaseConnections = await client.db().admin().logDatabaseConnections();
 
    console.log("Databases:");
    databaseConnections.databases.forEach(db => console.log(` - ${db.name}`));
};