// AMC Token Animation — random tokens on right, streamlined through "AMC" on left
(function(){
'use strict';
var canvas=document.getElementById('hero-canvas');
if(!canvas)return;
var ctx=canvas.getContext('2d');
var W,H,tokens=[],amcX,amcW;
var TOKEN_TEXTS=['GPT','LLM','RAG','MCP','L3','L4','0.4×','1.0×','Ed25519','NIST','ISO','OWASP','EU AI','HIPAA','SOC2','CI/CD','FHIR','PII','DLP','RBAC','TEE','CoT','RL','RLHF','SaMD','FDA','GxP','NIS2','GDPR'];

function resize(){
  W=canvas.width=canvas.parentElement.offsetWidth;
  H=canvas.height=canvas.parentElement.offsetHeight;
  amcX=W*0.15; amcW=W*0.35;
}

function Token(){
  this.reset();
}
Token.prototype.reset=function(){
  this.x=W*0.55+Math.random()*W*0.45;
  this.y=Math.random()*H;
  this.vx=-0.3-Math.random()*0.5;
  this.vy=(Math.random()-0.5)*0.3;
  this.text=TOKEN_TEXTS[Math.floor(Math.random()*TOKEN_TEXTS.length)];
  this.alpha=0.08+Math.random()*0.12;
  this.size=9+Math.random()*5;
  this.streamlined=false;
};
Token.prototype.update=function(){
  // When entering AMC zone, streamline (align to horizontal flow)
  var inZone=this.x<amcX+amcW&&this.x>amcX;
  if(inZone&&!this.streamlined){
    this.streamlined=true;
    this.vy=0;
    this.vx=-0.8;
    this.alpha=Math.min(this.alpha+0.05,0.25);
  }
  if(this.x<amcX&&this.streamlined){
    // Past AMC zone — fade out
    this.alpha-=0.003;
  }
  this.x+=this.vx;
  this.y+=this.vy;
  if(this.x<-50||this.alpha<=0)this.reset();
};
Token.prototype.draw=function(){
  ctx.save();
  ctx.globalAlpha=this.alpha;
  ctx.font=this.size+'px "Space Mono",monospace';
  ctx.fillStyle=this.streamlined?'#4AEF79':'#94B0BF';
  ctx.fillText(this.text,this.x,this.y);
  ctx.restore();
};

function init(){
  resize();
  for(var i=0;i<35;i++){tokens.push(new Token())}
  loop();
}

function loop(){
  ctx.clearRect(0,0,W,H);
  // Draw AMC background text
  ctx.save();
  ctx.globalAlpha=0.04;
  ctx.font='bold '+Math.min(W*0.22,200)+'px Inter,system-ui,sans-serif';
  ctx.fillStyle='#4AEF79';
  ctx.textAlign='center';
  ctx.fillText('AMC',W*0.32,H*0.55);
  ctx.restore();

  for(var i=0;i<tokens.length;i++){tokens[i].update();tokens[i].draw()}
  requestAnimationFrame(loop);
}

window.addEventListener('resize',resize);
init();
})();
