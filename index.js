const express = require("express");
const bodyParser = require("body-parser");
const Promise = require('promise');
const seneca = require('seneca')


const port = process.env.PORT || 8080;

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use(express.static('public'));

cnst rediscli = require("redis").createClient({
  url:process.env.REDIS_URL
});

let getClient = (serviceId) => {
  return new Promise((resolve, reject) => {

    rediscli.get(serviceId, function (err, reply) {
      if(err || reply==null) {
        reject(err || reply)
      } else {
        let serviceInfos = JSON.parse(reply.toString())
        console.log("🤖 serviceInfos", serviceInfos)
        let client = seneca( {log: { level: 'silent' }}).client(serviceInfos)
        resolve(client)
      }
    });

  })
}

let getGatewayInfos = (gatewayKey) => {
  return new Promise((resolve, reject) => {
    rediscli.get(gatewayKey, (err, reply) => {
      if(err) reject(err)
      if(reply) {
        let gatewayInfos = JSON.parse(reply.toString())

        gatewayInfos.id = gatewayKey // this is the service id

        // check if gateway is ok
        getClient(gatewayInfos.id).then(client => {
          client.act({role: "hello", cmd: "yo"}, (err, item) => {
            if(err) {
              // timeout
              console.error(`😡 gateway ${gatewayInfos.id} is ko`)
              // delete from redis db ... or not
              // ⚠️ gateways have to re publish their id periodically
              rediscli.del(gatewayInfos.id, (err, reply) => {
                console.error(`🤢 gateway ${gatewayInfos.id} removed from db`)
              })

            } else {
              console.log(`😃 gateway ${gatewayInfos.id} is ok`,item)
            }

          })
        }).catch(err => console.log("🤢"))

        resolve(gatewayInfos)

      } // end if

    });
  })
}

// TODO: study how to use redis like a pro -> pub/sub

// list of connected gateways
app.get('/gateways/all', (req, res) => {
  rediscli.keys(
    "gateway-*", (err, reply) => {
      console.log(reply)
      res.send(JSON.parse(JSON.stringify(reply)))
    }
  );
});

// list of connected gateways and details
app.get('/gateways/details', (req, res) => {
  rediscli.keys(
    "gateway-*", (err, gatewaysList) => {
      let promises = gatewaysList.map(gatewayKey => {
        return getGatewayInfos(gatewayKey)
      })
      Promise.all(promises).then(gatewayData =>{
        console.log("🎃 All Gateways informations:", gatewayData)
        res.send(JSON.parse(JSON.stringify(gatewayData)))
      })
    }
  );
});

// test: http://localhost:8080/gateways/gateway-42-service-local-dev/yo
app.get('/gateways/:gateway_id/yo', (req, res) => {
  let gateway_id = req.params.gateway_id

  getClient(gateway_id).then(client => {
    client.act({role: "hello", cmd: "yo"}, (err, item) => {
      res.send(item)
    })
  })

});

// test: http://localhost:8080/gateways/gateway-42-service-local-dev/sensors/temperature/t2
app.get('/gateways/:gateway_id/sensors/temperature/:sensor_id', (req, res) => {
  let gateway_id = req.params.gateway_id
  let sensor_id = req.params.sensor_id

  getClient(gateway_id).then(client => {
    client.act({role: "one-sensor", cmd: "temperature", id: sensor_id}, (err, item) => {
      res.send(item)
    })
  }).catch(err => {
    res.sendStatus(404)
  })

});

// test: http://localhost:8080/gateways/gateway-42-service-local-dev/sensors/humidity/h3
app.get('/gateways/:gateway_id/sensors/humidity/:sensor_id', (req, res) => {
  let gateway_id = req.params.gateway_id
  let sensor_id = req.params.sensor_id

  getClient(gateway_id).then(client => {
    client.act({role: "one-sensor", cmd: "humidity", id: sensor_id}, (err, item) => {
      res.send(item)
    })
  }).catch(err => {
    res.sendStatus(404)
  })

});

// +++++++++++ SSE Experiments +++++++++++

const openConnections = []

const sendSSEData = (openConnections) => {
  const d = new Date();
  const instanceInformations = {
    APP_ID: process.env.APP_ID || "APP_ID",
    TOTO: process.env.TOTO || "TOTO",
    INSTANCE_ID: process.env.INSTANCE_ID || "INSTANCE_ID",
    INSTANCE_TYPE: process.env.INSTANCE_TYPE || "INSTANCE_TYPE",
    COMMIT_ID: process.env.COMMIT_ID || "COMMIT_ID",
    INSTANCE_NUMBER: process.env.INSTANCE_NUMBER || "INSTANCE_NUMBER",
    d: d.getMilliseconds()
  }
  // we walk through each connection
  openConnections.forEach((resp) => {
    resp.write('id: ' + d.getMilliseconds() + '\n');
    resp.write('data:' + JSON.stringify(instanceInformations) + '\n\n');
  });
}

const callSendSSEData = () => sendSSEData(openConnections)
const getOpenConnections = () => openConnections

const timer = setInterval(callSendSSEData, 1000)

app.get('/instance/informations', (req, res) => {

  //req.socket.setTimeout(5000);

  // send headers for event-stream connection
  res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
  });
  res.write('\n');

  // push this res object to our global variable
  getOpenConnections().push(res);

  // When the request is closed, e.g. the browser window
  // is closed. We search through the open connections
  // array and remove this connection.
  req.on("close", function() {
    // not even sure that happens 😮
    getOpenConnections().splice(
      getOpenConnections().findIndex(item => item == res), 1
    )

    console.log("🎲", getOpenConnections().length);
  });
});
// +++++++ End of SSE Experiments ++++++++

app.listen(port);
console.log(`🌍 Web Server is started - listening on ${port}`);

// test on Clever Cloud http://useyodemo.cleverapps.io/services/yo
