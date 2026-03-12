// AMC Token Animation — random on left, streamlined through AMC on right with guardrails
(function(){
'use strict';
var canvas=document.getElementById('hero-canvas');
if(!canvas)return;
var ctx=canvas.getContext('2d');
var W,H,tokens=[];
var TOKENS=['GPT','LLM','RAG','MCP','L3','L4','0.4×','1.0×','Ed25519','NIST','ISO','OWASP','EU AI','HIPAA','SOC2','CI/CD','FHIR','PII','DLP','RBAC','TEE','CoT','RLHF','SaMD','FDA','GxP','NIS2','GDPR','JWT','TLS'];
var amcZoneStart,amcZoneEnd,guardrailY;

function resize(){
  W=canvas.width=canvas.parentElement.offsetWidth;
  H=canvas.height=canvas.parentElement.offsetHeight;
  amcZoneStart=W*0.45;
  amcZoneEnd=W*0.85;
  guardrailY=H*0.52;
}

function Token(){this.reset(true)}
Token.prototype.reset=function(init){
  this.x=init?Math.random()*W*0.4:Math.random()*W*0.35;
  this.y=H*0.15+Math.random()*H*0.7;
  this.origY=this.y;
  this.vx=0.4+Math.random()*0.6;
  this.vy=(Math.random()-0.5)*0.4;
  this.text=TOKENS[Math.floor(Math.random()*TOKENS.length)];
  this.alpha=0.06+Math.random()*0.1;
  this.targetAlpha=this.alpha;
  this.size=8+Math.random()*5;
  this.phase=0; // 0=random, 1=entering guardrail, 2=streamlined
};
Token.prototype.update=function(){
  if(this.phase===0&&this.x>=amcZoneStart){
    this.phase=1;
    this.targetAlpha=Math.min(this.alpha+0.08,0.22);
  }
  if(this.phase===1){
    // Converge to guardrail line
    var dy=guardrailY-this.y;
    this.vy=dy*0.03;
    this.vx=0.8;
    if(Math.abs(dy)<3){this.phase=2;this.vy=0;this.y=guardrailY}
  }
  if(this.phase===2){
    this.vx=1.0;
    this.vy=0;
    this.y=guardrailY;
  }
  // Alpha easing
  this.alpha+=(this.targetAlpha-this.alpha)*0.05;
  this.x+=this.vx;
  this.y+=this.vy;
  if(this.x>W+30){this.reset(false);this.phase=0}
};
Token.prototype.draw=function(){
  ctx.save();
  ctx.globalAlpha=this.alpha;
  ctx.font=this.size+'px "Space Mono",monospace';
  ctx.fillStyle=this.phase>=1?'#4AEF79':'#94B0BF';
  ctx.fillText(this.text,this.x,this.y);
  ctx.restore();
};

function drawAMC(){
  ctx.save();
  ctx.globalAlpha=0.035;
  var fontSize=Math.min(W*0.25,220);
  ctx.font='800 '+fontSize+'px Inter,system-ui,sans-serif';
  ctx.fillStyle='#4AEF79';
  ctx.textAlign='center';
  ctx.fillText('AMC',W*0.65,H*0.58);
  ctx.restore();
  // Guardrail lines (subtle)
  if(amcZoneStart){
    ctx.save();
    ctx.globalAlpha=0.04;
    ctx.strokeStyle='#4AEF79';
    ctx.lineWidth=1;
    ctx.setLineDash([4,8]);
    ctx.beginPath();
    ctx.moveTo(amcZoneStart,guardrailY-1);
    ctx.lineTo(W,guardrailY-1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(amcZoneStart,guardrailY+12);
    ctx.lineTo(W,guardrailY+12);
    ctx.stroke();
    ctx.restore();
  }
}

function loop(){
  ctx.clearRect(0,0,W,H);
  drawAMC();
  for(var i=0;i<tokens.length;i++){tokens[i].update();tokens[i].draw()}
  requestAnimationFrame(loop);
}

function init(){
  resize();
  for(var i=0;i<30;i++)tokens.push(new Token());
  loop();
}

window.addEventListener('resize',resize);
init();
})();
