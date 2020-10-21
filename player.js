/**
 * Class for the Player game object to store pos, direction,
 * size, color, name, etc.
 */

const MAX_GROWTH_RATE = 50; // Units per second we can grow at after eating
const MIN_RADIUS = 50;
const MAX_RADIUS = 500;
const SHRINK_RADIUS = 300; // Radius after which you begin to shrink
const SHRINK_RATE = 3; // Radius/second that you shrink at after exceeding the above
const MIN_SPEED = 50; // Units/second at maximum size
const MAX_SPEED = 100; // Units/second at minumum size;

class Player {
  constructor(connection, pos) {
    this.connection = connection;
    this.alive = false;
    this.pos = pos; // position
    this.r = MIN_RADIUS; // radius
    this.growToR = this.r; // radius we are growing to
    this.dir = {x: 0, y: 0}; // direction
    this.name = "";
  }

  // Spawn with name given by the user
  spawn(name, pos) {
    this.alive = true;
    this.name = name;
    this.pos = pos;
    this.r = MIN_RADIUS;
    this.growToR = this.r;
    this.dir = {x: 0, y: 0};
  }

  // Set the new dir based on user input. It will be
  // used to calculate velocity during next update. The dir
  // must be a vector with magnitude between 0 and 1 inclusive -
  // the size of the player determines the speed this will be
  // multiplied by. Truncate to a unit vector if client passed
  // too large of a value.
  setDir(dir) {
    this.dir.x = dir.x;
    this.dir.y = dir.y;
    const magnitude = Math.sqrt((dir.x * dir.x) + (dir.y * dir.y));
    if (magnitude > 1) {
      this.dir.x /= magnitude;
      this.dir.y /= magnitude;
    }
  }

  // Increase size from eating food or a player.
  eat(otherRadius) {
    const thisArea = Math.PI * this.r * this.r;
    const otherArea = Math.PI * otherRadius * otherRadius;
    const newArea = thisArea + otherArea;
    this.growToR = Math.sqrt(newArea / Math.PI);
    this.growToR = Math.min(this.growToR, MAX_RADIUS);
  }

  // Gets max speed determined by the size of the player. This is
  // in game units per second
  getMaxSpeed() {
    return (
      MIN_SPEED + (
	(MAX_SPEED - MIN_SPEED) *
	(MAX_RADIUS - this.r) /
	(MAX_RADIUS - MIN_RADIUS)
      )
    );
  }

  // Update pos based on the current dir
  // and the time since last update
  update(deltaSeconds) {
    const maxSpeed = this.getMaxSpeed();
    this.pos.x += this.dir.x * maxSpeed * deltaSeconds;
    this.pos.y += this.dir.y * maxSpeed * deltaSeconds;

    if (this.r < this.growToR) {
      this.r = Math.min(this.growToR, this.r + (MAX_GROWTH_RATE * deltaSeconds));
    }

    if (this.r > SHRINK_RADIUS) {
      const shrinkAmount =
	    Math.min(this.r - SHRINK_RADIUS, SHRINK_RATE * deltaSeconds);
      this.r -= shrinkAmount;
      this.growToR -= shrinkAmount;
    }
  }

  // Used to get object for JSON serialization to the client
  getObj() {
    return {
      name: this.name,
      pos: this.pos,
      r: this.r,
      alive: this.alive,
    };
  }
}

module.exports = Player;
