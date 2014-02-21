/* Implementation pour plateau carree */

var pasAngle = (2 * Math.PI)/40;
var width = 800;
var widthCase = 220;

function getCoords(angle,rayon){
	return {
		y:(Math.sin(angle))*rayon,
		x:(Math.cos(angle))*rayon
	}
}

function convertAxePos(axe,pos){
	return ((axe+2)%4)*10 + pos;
}

var nbJoueurs = 0;

// Represente un pion d'un joueur
function CirclePionJoueur(color, largeur) {
	Component.apply(this);
	this.pos;
	this.color = color;
	this.isSelected = false;
	this.largeur = largeur; // Largeur du pion
	
	this.init = function(axe,pos){
		this.pos = convertAxePos(axe,pos);
		/* Gere le decalage de chaque joueur lors de la creation */
		this._rayon = width/2- (70 + (nbJoueurs%3)*25);
		this._angle = 0.5 + ((nbJoueurs%2)?1:-1) * 0.25;
		nbJoueurs++;
	}
	
	this.draw = function (canvas) {
		var centre = getCoords((this.pos+this._angle)*pasAngle,this._rayon);
		if(this.isSelected){
			canvas.beginPath();
			canvas.fillStyle = '#FFFFFF';
			canvas.arc(centre.x+width/2,centre.y+width/2,12,0,2*Math.PI);
			canvas.fill();
			canvas.closePath();	
		}		
		canvas.beginPath();
		canvas.fillStyle = this.color;
		canvas.arc(centre.x+width/2,centre.y+width/2,10,0,2*Math.PI);
		canvas.fill();
		canvas.closePath();				
	}
	this.setSelected = function(value){
		this.isSelected = value;
	}
	
	this._moveTo = function(ciblePos,callback,pas){			
		var limit = 0 ;	
		var _self = this;
		if(this.pos!=ciblePos){
			setTimeout(function(){
				_self.pos=parseFloat((_self.pos + pas).toFixed(1));
				if(_self.pos>=40){
					_self.pos = 0;
				}
				//drawPion(currentPos);
				_self._moveTo(ciblePos,callback,pas);
			},30);
		}
		else{
			// Fin
			if(callback){
				callback();
			}
		}
	}
	
	// Se dirige vers une cellule donnee. Se deplace sur la case suivante et relance l'algo
	this.goto = function (axe, pos, callback) {
		var ciblePos = convertAxePos(axe,pos);
		this._moveTo(ciblePos,callback,0.1);			
	}
	
	this.gotoDirect = function(axe, pos, callback){
		if (axe == null || pos == null) {
			return;
		}
		var ciblePos = convertAxePos(axe,pos);
		this._moveTo(ciblePos,callback,1);	       
	}
	
	this.init(2,0);
}

function CircleCase(pos, axe, color, title, prix, img){
	Component.apply(this);
	this.pos = convertAxePos(axe,pos);
	this.color = color;
	this.title = title;
	this.prix = prix;
	this.img = img;
	this.nbMaison = 0;
	this.data = {};
	this.imageMaison = new Image();
	this.imageHotel = new Image();
	this.joueurPossede = null;
	
	this.setJoueur = function(joueur){
		this.joueurPossede = joueur;
	}
	
	this.setNbMaison = function(nbMaison){
		this.nbMaison = nbMaison;
	}
	
	this.init = function(){
        this.imageMaison.src = "img/maison.png";
        this.imageHotel.src = "img/hotel.png";
		
		if (this.img != null) {		
			this.img = $.extend(true,{},DrawerFactory.infos.defaultImage || {},this.img);
			var image = new Image();
			image.src = this.img.src;
			image.height = Math.min(this.img.height,30);
			image.width = Math.min(this.img.width,40);
			image.margin = this.img.marginTop || 0;
			image.marginLeft = this.img.marginLeft || 0;
			image.rotate = this.img.rotate || 0;
			if(this.pos > 10 && this.pos < 30){
				image.rotate = (image.rotate+180)%360;
				image.marginLeft = image.marginLeft +0.5;	
				image.margin=Math.max(0,image.margin-20);
			}
			this.data.image = image;
		}
	}

	this.draw = function(canvas){
		var pA = getCoords(this.pos*pasAngle,width/2);
		var pB = getCoords(this.pos*pasAngle,width/2-widthCase);
		canvas.fillStyle='#000000';
		canvas.lineWidth=0.5;
		canvas.moveTo(width/2 - pA.x,width/2 - pA.y);
		canvas.lineTo(width/2 - pB.x,width/2 - pB.y);
		canvas.stroke();
		var maxLength = 120;
		if(this.color!=null){
			canvas.beginPath();
			canvas.fillStyle=this.color;
			canvas.moveTo(width/2,width/2);
			canvas.arc(width/2,width/2,width/2-2,(this.pos)*pasAngle,(this.pos+1)*pasAngle);
			canvas.fill();
			canvas.closePath();
			canvas.beginPath();
			canvas.fillStyle='#FFFFFF';
			canvas.moveTo(width/2,width/2);
			canvas.arc(width/2,width/2,width/2-25,this.pos*pasAngle,(this.pos+1)*pasAngle);
			canvas.fill();
			canvas.closePath();
		}		
		if(this.title!=null){
			if(this.pos > 10 && this.pos < 30){
				var p = getCoords((this.pos+0.7)*pasAngle,width/2-30);
				DrawerHelper.writeText(this.title, p.x + width/2,p.y + width/2, ((this.pos+20)%40 + 0.8)*pasAngle, canvas,9,maxLength,'left');
			}else{
				var length = canvas.measureText(this.title).width + 30;
				var p = getCoords((this.pos+0.3)*pasAngle,width/2 -maxLength - 30);
				DrawerHelper.writeText(this.title, p.x + width/2,p.y + width/2, (this.pos + 0.2)*pasAngle, canvas,9,maxLength,'right');
			}			
		}
		if(this.prix!=null){
			if(this.pos > 10 && this.pos < 30){
				var p = getCoords((this.pos+0.15)*pasAngle,width/2-30);
				DrawerHelper.writeText(this.prix, p.x + width/2,p.y + width/2, ((this.pos+20)%40 + 0.5)*pasAngle, canvas,9,maxLength,'left');
			}else{
				var length = canvas.measureText(this.prix).width + 30;
				var p = getCoords((this.pos+0.9)*pasAngle,width/2 -maxLength - 30);
				DrawerHelper.writeText(this.prix, p.x + width/2,p.y + width/2, (this.pos + 0.7)*pasAngle, canvas,9,maxLength,'right');
			}
		}
		// Image
		if (this.data.image != null) {
			// Margin left est defini en portion d'angle (1 correspond a la largeur de la case)
			// Margin top joue sur la longueur du rayon
			var coords = getCoords((this.pos + this.data.image.marginLeft)*pasAngle,width/2-30 - this.data.image.margin);
			console.log(coords,this.data.image.margin,this.title);
			var angle = DrawerHelper.fromDegresToRad(this.data.image.rotate) + this.pos*pasAngle + Math.PI/2;
			DrawerHelper.drawImage(canvas, this.data.image, width/2+coords.x, width/2+coords.y, this.data.image.width,this.data.image.height, angle);
		}
		if(this.nbMaison <= 4){
			for(var i = 0 ; i < this.nbMaison ; i++){
				var coords = getCoords((this.pos + 0.25*i)*pasAngle,width/2-4);
				DrawerHelper.drawImage(canvas, this.imageMaison, width/2+coords.x, width/2+coords.y, 16,16, this.pos*pasAngle + Math.PI/2)				
	    	}
    	}
    	else{
    		var coords = getCoords((this.pos + 0.4)*pasAngle,width/2-4);
    		DrawerHelper.drawImage(canvas, this.imageHotel, width/2+coords.x, width/2+coords.y, 16,16, this.pos*pasAngle + Math.PI/2)							
    	}
	}
	this.init();
}

function CircleCaseSpeciale(axe, title){
	Component.apply(this);
	this.pos = convertAxePos(axe,0);
	this.title = title;
	this.draw = function(canvas){
		
		var pA = getCoords(this.pos*pasAngle,width/2);
		var pB = getCoords(this.pos*pasAngle,width/2-widthCase);
		canvas.fillStyle='#FFFFFF';
		canvas.lineWidth=0.5;
		canvas.moveTo(width/2 - pA.x,width/2 - pA.y);
		canvas.lineTo(width/2 - pB.x,width/2 - pB.y);
		canvas.stroke();
		DrawerHelper.drawArcCircle(canvas,'#FFFFFF',width/2,{x:width/2,y:width/2},this.pos*pasAngle,(this.pos+1)*pasAngle)
		var maxLength = 120;
		if(this.title!=null){
			if(this.pos > 10 && this.pos < 30){
				var p = getCoords((this.pos+0.7)*pasAngle,width/2-30);
				DrawerHelper.writeText(this.title, p.x + width/2,p.y + width/2, ((this.pos+20)%40 + 0.8)*pasAngle, canvas,9,maxLength,'left');
			}else{
				var length = canvas.measureText(this.title).width + 30;
				var p = getCoords((this.pos+0.3)*pasAngle,width/2 -maxLength - 30);
				DrawerHelper.writeText(this.title, p.x + width/2,p.y + width/2, (this.pos + 0.2)*pasAngle, canvas,9,maxLength,'right');
			}
		}
	}
}

/* Represente un dé physique */
function CircleDes(x, y, width) {
	Des.call(this,x+195,y+100,width);	
}

function CirclePlateau(x,y,width,height,color){
	Component.apply(this);
	this.data = {
		x: x,
		y: y,
		width: width,
		height: height
	};

	this.draw = function (canvas) {
		DrawerHelper.drawCircle(canvas,color,this.data.width/2,{x:this.data.width/2,y:this.data.width/2});		
	}
}

/* Dessiné en dernier sur le plateau */
function EndCirclePlateau(){
	Component.apply(this);
	
	this.draw = function(canvas){
		DrawerHelper.drawCircle(canvas,'#000000',width/2-widthCase,{x:width/2,y:width/2});
		DrawerHelper.drawCircle(canvas,'#FFFFFF',width/2-widthCase - 2,{x:width/2,y:width/2});
		DrawerHelper.drawArcCircle(canvas,'#FF0000',width/2-widthCase -2,{x:width/2,y:width/2},-Math.PI,0);	
		DrawerHelper.drawCircle(canvas,'#FFFFFF',width/2-widthCase - 50,{x:width/2,y:width/2});
	}
}

function initCircleInstance(){
	var instance = {
		type:'circle',
		standardCase:CircleCase,
		specialCase:CircleCaseSpeciale,
		pionJoueur:CirclePionJoueur,
		des:CircleDes,
		plateau:CirclePlateau,
		endPlateau:EndCirclePlateau
	}
	DrawerFactory.addInstance(instance);
}

$(function(){initCircleInstance();});