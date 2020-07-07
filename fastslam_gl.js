var io = require('socket.io-client');
var ss = require('socket.io-stream');
const fs = require('fs');

var socket = io();
var stream = ss.createStream({
  highWaterMark: 1024,
  objectMode: true
});

ss(socket).emit('setup-stream', stream);

const HISTORY_LENGTH = 5000;
const NUM_PARTICLES = 150;
var positions = new Float32Array( 2 * NUM_PARTICLES * HISTORY_LENGTH );
var indices = new Float32Array( NUM_PARTICLES * HISTORY_LENGTH );
for (var i = 0; i < indices.length; i++) {
  indices[i] = i;
}

var zoom_rate=0.008;
var xcamera = 0.0;
var ycamera = 0.0;
var zcamera = 250.0;
const fieldOfView = 40 * Math.PI / 180;

const zNear = 1;
const zFar = 800.0;


main();

function main() {

  console.log('hi');
  const canvas = document.querySelector('#glcanvas');

  //tested on firefox 57.
  canvas.onwheel = function (event){
    if (event.ctrlKey) {
        event.preventDefault();
        event.stopImmediatePropagation();

        var rect = canvas.getBoundingClientRect();

        var mousex = event.clientX - rect.left;
        var mousey = canvas.clientHeight -(event.clientY - rect.top);

        var xnorm = 2 * mousex / canvas.clientWidth - 1;
        var ynorm = 2 * mousey / canvas.clientHeight - 1;

        var xworld =  xnorm * (zcamera) * ( Math.tan(fieldOfView / 2.0) * zNear * gl.canvas.clientWidth / gl.canvas.clientHeight  ) / ( zNear) + xcamera;
        var yworld =  ynorm * (zcamera) * ( Math.tan(fieldOfView / 2.0) * zNear ) / ( zNear) + ycamera;

        var wheel = event.deltaY;
        var zoom = 2 - Math.exp(-wheel*zoom_rate);
        zcamera = Math.min( 700.0, Math.max (zoom * zcamera, 10.0 ));

        xcamera = xworld - xnorm * (zcamera) * ( Math.tan(fieldOfView / 2.0) * zNear * gl.canvas.clientWidth / gl.canvas.clientHeight) / ( zNear);
        ycamera = yworld - ynorm * (zcamera) * ( Math.tan(fieldOfView / 2.0) * zNear  ) / ( zNear);

        xcamera = Math.min( 300.0, Math.max ( xcamera, -300.0 ));
        ycamera = Math.min( 500.0, Math.max ( ycamera, -200.0 ));

    }
  }

 /* canvas.onclick = function (event){

        event.preventDefault();
        event.stopImmediatePropagation();

        var rect = canvas.getBoundingClientRect();

        var mousex = event.clientX - rect.left;
        var mousey = canvas.clientHeight -(event.clientY - rect.top);

        var xnorm = 2 * mousex / canvas.clientWidth - 1;
        var ynorm = 2 * mousey / canvas.clientHeight - 1;

        var xworld =  xnorm * (zcamera) * ( Math.tan(fieldOfView/2.0) * zNear * gl.canvas.clientWidth / gl.canvas.clientHeight  ) / ( zNear) + xcamera;
        var yworld =  ynorm * (zcamera) * ( Math.tan(fieldOfView/2.0) * zNear ) / ( zNear) + ycamera;


        console.log("mousex: " + mousex);
        console.log("mousey: " + mousey);
        console.log("xnorm: " + xnorm);
        console.log("ynorm: " + ynorm);
        console.log("xworld: " + xworld);
        console.log("yworld: " + yworld);

}*/

  const gl = canvas.getContext('webgl');

  if (!gl) {
    alert('Unable to initialize WebGL.');
    return;
  }

  const vsSource = `
    attribute vec4 aVertexPosition;
    attribute float aVertexID;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform int uStart;

    varying vec4 color;

    void main() {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      gl_PointSize = 1.0;
      color = exp(-0.000005*5.0/5.0*((aVertexID>float(uStart))?
                                (-aVertexID+float(uStart)+5000.0 * 150.0):
                                (-aVertexID+float(uStart))))
                          *vec4(0.0, 0.0, 0.0, 1);

    }
  `;

  const fsSource = `
    precision mediump float;
    varying vec4 color;

    void main() {
      gl_FragColor = color;
    }
  `;

  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      vertexID: gl.getAttribLocation(shaderProgram, 'aVertexID'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
      startIndex: gl.getUniformLocation(shaderProgram, 'uStart'),
    },
  };

  const vsSource1 = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;

    void main() {
      gl_Position = aVertexPosition;
      vTexCoord = aTexCoord;
    }
  `;

  const fsSource1 = `
    precision mediump float;
    varying vec2 vTexCoord;
    uniform sampler2D uTexture;

    void main() {
      gl_FragColor = texture2D(uTexture, vTexCoord);
    }
  `;

  const shaderProgram1 = initShaderProgram(gl, vsSource1, fsSource1);

  const programInfo1 = {
    program: shaderProgram1,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram1, 'aVertexPosition'),
      textureCoord: gl.getAttribLocation(shaderProgram1, 'aTexCoord'),
    },
    uniformLocations: {
      textureSampler: gl.getUniformLocation(shaderProgram1, 'uTexture')
    },
  };

  var block = 0;

  const buffers = initBuffers(gl, positions);
  var buff_particles = 0;

  stream.on('readable', function() {

    var tmp = stream.read(1);//maybe we can get a Float32Array right here.
    for (var i = 0; i < 2 * NUM_PARTICLES; i++) {
      positions[block* 2 * NUM_PARTICLES + i] = tmp[i];
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.id);
    gl.bufferData(gl.ARRAY_BUFFER,
                  indices,
                  gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.bufferData(gl.ARRAY_BUFFER,
                  positions,
                  gl.DYNAMIC_DRAW);

    buff_particles = Math.min(buff_particles+NUM_PARTICLES, NUM_PARTICLES * HISTORY_LENGTH );
    block=(block+1)%HISTORY_LENGTH;

    drawScene(gl, programInfo, programInfo1, block, buff_particles, buffers);

  });

}

function initBuffers(gl, positions) {

  const positionBuffer = gl.createBuffer();
  const idBuffer = gl.createBuffer();
    return {
    position: positionBuffer,
    id: idBuffer
  };
}

function drawScene(gl, programInfo, programInfo1, block, buff_particles, buffers) {

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  //gl.clearDepth(1.0);
  //gl.enable(gl.DEPTH_TEST);
  //gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

  const projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix,
                   fieldOfView,
                   aspect,
                   zNear,
                   zFar);

  /*mat4.ortho(projectionMatrix,
              -380.0,
              380.0,
              -360.0,
              360.0,
              1.0,
              800.0);*/

  const modelViewMatrix = mat4.create();
  mat4.translate(modelViewMatrix,
                 modelViewMatrix,
                 [-xcamera,-ycamera, -zcamera]);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.id);
  gl.vertexAttribPointer(
         programInfo.attribLocations.vertexID,
         1,
         gl.FLOAT,
         false,
         0,
         0);
  gl.enableVertexAttribArray(programInfo.attribLocations.vertexID);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        2,
        gl.FLOAT,
        false,
        0,
        0);
  gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

  gl.useProgram(programInfo.program);

  gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      projectionMatrix);
  gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix);
  gl.uniform1i(
      programInfo.uniformLocations.startIndex,
      (NUM_PARTICLES*block-1)%(NUM_PARTICLES*HISTORY_LENGTH)
      );

  gl.viewport(0, 0, gl.canvas.clientWidth, gl.canvas.clientHeight);
  if (buff_particles == NUM_PARTICLES * HISTORY_LENGTH && block > 0) {
    gl.drawArrays(gl.POINTS, NUM_PARTICLES * block , NUM_PARTICLES * (HISTORY_LENGTH-block));
  }
  gl.drawArrays(gl.POINTS, 0, block>0 ? NUM_PARTICLES*block: NUM_PARTICLES*HISTORY_LENGTH);

}

function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }


  return shaderProgram;
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
