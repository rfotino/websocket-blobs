const http = require('http');
const websocket = require('websocket');
const Player = require('./player.js');

const FOOD_RADIUS = 5;
const MAX_PLAYERS = 100;
const MAX_FOOD = 200;
const UPDATE_FREQUENCY = 60; // times per second to update
const WORLD_BOUNDS = {
  x: 0,
  y: 0,
  width: 2000,
  height: 1200,
};

const server = http.createServer(function(request, response) {
  console.log((new Date()) + ' Received request for ' + request.url);
  response.writeHead(404);
  response.end('cya');
});

server.listen(8080, function() {
  console.log((new Date()) + ' Server is listening on port 8080');
});

wsServer = new websocket.server({
  httpServer: server,
  autoAcceptConnections: true,
});


// Use maps for players and food so that we can do fast insertions/deletions
let nextPlayerId = 1, nextFoodId = 1;
let numPlayers = 0, numFood = 0;
const players = {}, foodParticles = {};

// Get player state to serialize to the client. We do this in multiple
// places so it's made into a function here
function getPlayerStates() {
  const playerStates = {};
  for (const playerId in players) {
    playerStates[playerId] = players[playerId].getObj();
  }
  return playerStates;
}

wsServer.on('connect', function(connection) {
  console.log((new Date()) + ' Accepted new connection');

  // Only allow so many players at a time
  if (numPlayers >= MAX_PLAYERS) {
    console.log((new Date()) + ' Too many concurrent players - closing connection.');
    connection.sendUTF(JSON.stringify({
      type: 'error',
      reason: 'Too many concurrent players.',
    }));
    connection.close(
      websocket.connection.CLOSE_REASON_NORMAL,
      'Too many concurrent players.',
    );
    return;
  }

  // TODO: Choose a spawn location based on the location of other players
  const spawnPosition = {
    x: Math.random() * (WORLD_BOUNDS.width) + WORLD_BOUNDS.x,
    y: Math.random() * (WORLD_BOUNDS.height) + WORLD_BOUNDS.y,
  };
  const player = new Player(connection, spawnPosition);

  // Listen for user inputs
  connection.on('message', function(message) {
    if (message.type !== 'utf8') {
      console.log((new Date()) + ' Got unexpected binary message.');
      return;
    }
    let deserialized;
    try {
      deserialized = JSON.parse(message.utf8Data);
    } catch(e) {
      console.log((new Date()) + ' Exception parsing JSON: ' + e + ', ' + message.utf8Data);
      return;
    }
    try {
      switch (deserialized.type) {
      case 'move':
	player.setDir(deserialized.dir);
	break;
      case 'ping':
	player.connection.sendUTF(JSON.stringify({type: 'pong'}));
	break;
      }
    } catch(e) {
      console.log((new Date()) + ' Malformed message payload: ' + e);
    }
  });

  // Remove players that have closed connection
  const thisPlayerId = nextPlayerId;
  connection.on('close', function(reasonCode, description) {
    console.log((new Date()) + ' Connection closed (' + reasonCode + '): ' + description);
    delete players[thisPlayerId];
    numPlayers--;
  });

  // Add to players array so that we can update game state of all players,
  // and remove from array after connection has closed
  const playerId = nextPlayerId;
  players[playerId] = player;
  nextPlayerId++;
  numPlayers++;

  // Send spawn info to client so that we can only send deltas after that
  // to reduce bandwidth
  connection.sendUTF(JSON.stringify({
    type: 'spawn',
    state: {
      playerId,
      players: getPlayerStates(),
      foodParticles,
      worldBounds: WORLD_BOUNDS,
    },
  }));
});

// Update game state with regular frequency and send updates to
// connected clients
let timeStart = process.hrtime.bigint();
function updateGame() {
  const timeEnd = process.hrtime.bigint();
  const deltaSeconds = Number(timeEnd - timeStart) / 1e9;
  timeStart = timeEnd;

  // Spawn missing food, save to "added food" object so that we can send that
  // as a delta to the client
  const addedFood = {};
  while (numFood < MAX_FOOD) {
    const food = {
      x: Math.floor((Math.random() * WORLD_BOUNDS.width) + WORLD_BOUNDS.x),
      y: Math.floor((Math.random() * WORLD_BOUNDS.height) + WORLD_BOUNDS.y),
    };
    foodParticles[nextFoodId] = food;
    addedFood[nextFoodId] = food;
    nextFoodId++;
    numFood++;
  }

  // Move players around, force within bounds, eat food. Save array of eaten
  // food ids so we can send that delta to the client
  const removedFood = [];
  for (const playerId in players) {
    const player = players[playerId];
    player.update(deltaSeconds);
    player.pos.x = Math.max(player.pos.x, WORLD_BOUNDS.x + player.r);
    player.pos.x = Math.min(player.pos.x, WORLD_BOUNDS.x + WORLD_BOUNDS.width - player.r);
    player.pos.y = Math.max(player.pos.y, WORLD_BOUNDS.y + player.r);
    player.pos.y = Math.min(player.pos.y, WORLD_BOUNDS.y + WORLD_BOUNDS.height - player.r);
    for (const foodId in foodParticles) {
      const food = foodParticles[foodId];
      const deltaX = food.x - player.pos.x;
      const deltaY = food.y - player.pos.y;
      if ((deltaX * deltaX) + (deltaY * deltaY) < player.r * player.r) {
	player.eat(FOOD_RADIUS);
	removedFood.push(foodId);
	delete foodParticles[foodId];
	numFood--;
      }
    }
  }

  // Determine which players have been eaten, add their mass to other players
  const eatenToEater = {};
  for (const eaterId in players) {
    if (eatenToEater.hasOwnProperty(eaterId)) {
      continue;
    }
    const eater = players[eaterId];
    for (const eatenId in players) {
      if (eaterId === eatenId || eatenToEater.hasOwnProperty(eatenId)) {
	continue;
      }
      const eaten = players[eatenId];
      const dist = Math.sqrt(
	Math.pow(eater.pos.x - eaten.pos.x, 2) +
	Math.pow(eater.pos.y - eaten.pos.y, 2)
      );
      if (dist + eaten.r < eater.r) {
	eatenToEater[eatenId] = eaterId;
      }
    }
  }

  // Do the eating
  for (const eatenId in eatenToEater) {
    const eaterId = eatenToEater[eatenId];
    const eaten = players[eatenId];
    const eater = players[eaterId];
    eater.eat(eaten.r);
    eaten.connection.sendUTF(JSON.stringify({
      type: 'error',
      reason: 'You have been eliminated.',
    }));
    eaten.connection.close(
      websocket.connection.CLOSE_REASON_NORMAL,
      'You have been eliminated',
    );
    delete players[eatenId];
  }

  // Report world state to clients. TODO: optimize this so
  // that it's not repeating serialization many times
  for (const playerId in players) {
    const player = players[playerId];
    player.connection.sendUTF(JSON.stringify({
      type: 'update',
      state: {
	playerId,
	players: getPlayerStates(),
	addedFood,
	removedFood,
	worldBounds: WORLD_BOUNDS,
      }
    }));
  }
}
setInterval(updateGame, 1000 / UPDATE_FREQUENCY);
