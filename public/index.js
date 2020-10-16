const socket = new WebSocket('ws://localhost:8080');
let serverGameState = null;

// Log some extra info about different socket events
socket.onopen = function(event) {
  console.log('socket successfully opened');
};
socket.onclose = function(event) {
  alert('Socket has been closed.');
  console.error('socket has been closed');
  console.error(event);
};

socket.onmessage = function(event) {
  const message = JSON.parse(event.data);
  switch (message.type) {
  case 'error':
    alert(message.reason);
    break;
  case 'update':
    serverGameState = message.state;
    break;
  }
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Input listeners to update direction sent to server
const dir = {x: 0, y: 0};
function updateDir(mousePos) {
  // How far mouse is moved from the center of the canvas
  const delta = {
    x: mousePos.x - (canvas.width / 2),
    y: mousePos.y - (canvas.height / 2),
  };
  // Going halfway to the edge of the screen should be enough to apply max speed
  const maxDist = Math.min(canvas.width, canvas.height) / 2;
  // Apply scaling based on maxDist before sending to server. If the direction ends
  // up being more than a unit vector the server will do truncation, as it has to
  // prevent bad actors anyway
  dir.x = delta.x / maxDist;
  dir.y = delta.y / maxDist;
}
canvas.addEventListener('mousemove', function(event) {
  updateDir({x: event.offsetX, y: event.offsetY});
});
canvas.addEventListener('touchstart', function(event) {
  updateDir({x: event.touches[0].clientX, y: event.touches[0].clientY});
});
canvas.addEventListener('touchmove', function(event) {
  updateDir({x: event.touches[0].clientX, y: event.touches[0].clientY});
});

function update() {
  // TODO: Do prediction of new object positions based on most recently seen
  // server state
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  // Update the server with the current client direction
  socket.send(JSON.stringify({type: 'move', dir}));
}

function draw() {
  // Resize canvas, as the viewport size may have changed
  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // Reset, don't go any further if we don't have server state yet
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (serverGameState === null) {
    return;
  }

  // Center the view on the current player
  ctx.save();
  const currentPlayer = serverGameState.players[serverGameState.playerId];
  const scaleFactor = Math.min(canvas.width, canvas.height) / (currentPlayer.r * 10);
  const translation = {
    x: (canvas.width / 2) - currentPlayer.pos.x,
    y: (canvas.height / 2) - currentPlayer.pos.y,
  };
  ctx.scale(scaleFactor, scaleFactor);
  ctx.translate(-currentPlayer.pos.x, -currentPlayer.pos.y);
  ctx.translate(canvas.width / (2 * scaleFactor), canvas.height / (2 * scaleFactor));

  // Draw grid lines to show the bounds of the world
  ctx.save();
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 3;
  for (let x = 0; x <= serverGameState.worldBounds.width; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, serverGameState.worldBounds.height);
    ctx.stroke();
  }
  for (let y = 0; y <= serverGameState.worldBounds.height; y += 100) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(serverGameState.worldBounds.width, y);
    ctx.stroke();
  }
  ctx.restore();

  // Draw food particles as dots
  ctx.save();
  ctx.fillStyle = '#99ff99';
  ctx.strokeStyle = '#66cc66';
  ctx.lineWidth = 2;
  for (const foodId in serverGameState.foodParticles) {
    const food = serverGameState.foodParticles[foodId];
    ctx.beginPath();
    ctx.arc(food.x, food.y, 5 /* radius */, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // Draw players as blobs
  ctx.save();
  ctx.fillStyle = '#9999ff';
  ctx.strokeStyle = '#6666cc';
  ctx.lineWidth = 5;
  for (const playerId in serverGameState.players) {
    if (playerId === serverGameState.playerId) {
      continue;
    }
    const player = serverGameState.players[playerId];
    ctx.beginPath();
    ctx.arc(player.pos.x, player.pos.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Draw current player over any other players
  ctx.beginPath();
  ctx.arc(currentPlayer.pos.x, currentPlayer.pos.y, currentPlayer.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Undo transform to center on current player so that we can draw UI components
  ctx.restore();
}

function updateAndDraw() {
  update();
  draw();
  requestAnimationFrame(updateAndDraw);
}
updateAndDraw();
