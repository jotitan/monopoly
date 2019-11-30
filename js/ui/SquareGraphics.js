/* Implementation pour plateau carree */

/* Represente un pion d'un joueur */
// TODO : sortir GestionFiche
function PionJoueur(color, largeur,img,joueur) {
	Component.apply(this);
	this.axe = 0;
	this.pos = 0;
	this.x = 0;
	this.y = 0;
	// Used to know status of gamer, like dead
	this.joueur = joueur;
	this.color = color;
	this.isSelected = false;
	this.largeur = largeur; // Largeur du pion
	this.currentInterval = null;

	this.img = null;
	if(img){
		this.img = new Image();
		this.img.src = img;
		this.largeur+=6;
	}

	this.init = function(axe,pos){
		var id = axe + "-" + pos;
		this.axe = axe;
		this.pos = pos;
		this.x = GestionFiche.getById(id).drawing.getCenter().x;
		this.y = GestionFiche.getById(id).drawing.getCenter().y;
	}

	this.draw = function (canvas) {
		// If dead, show nothing
		if(this.joueur.defaite){return;}
		if(this.isSelected){
			DrawerHelper.drawCircle(canvas,"#FFFFFF",(this.largeur+6) / 2,{x:this.x,y:this.y},"#FF0000");
		}
		if(this.img!=null){
			DrawerHelper.drawImage(canvas, this.img, this.x-this.largeur/2, this.y-this.largeur/2, this.largeur, this.largeur, 0);
		}
		else{
			DrawerHelper.drawCircle(canvas,this.color,this.largeur / 2,{x:this.x,y:this.y},"#FF0000");
		}
	}
	this.setSelected = function(value){
		this.isSelected = value;
	}

	// Se dirige vers une cellule donnee. Se deplace sur la case suivante et relance l'algo
	this.goto = function (axe, pos, callback,init) {
		if(VARIANTES.quickMove){
			return this.gotoDirect(axe,pos,callback);
		}
		if (this.currentInterval != null) {
			throw "Impossible de realiser ce deplacement primaire";
		}
		// Cas initial
		if(init){
			var center = GestionFiche.getById(this.axe + "-" + this.pos).drawing.getCenter();
			this.x = center.x;
			this.y = center.y;
		}
		// Cas de la fin
		if (this.axe == axe && this.pos == pos) {
			var decalage = GestionFiche.getById(this.axe + "-" + this.pos).drawing._decalagePion();
			this.x = decalage.x;
			this.y = decalage.y;
			if (callback) {
				callback();
			}
			return;
		}
		var caseFiche = this._toNextCase();
		var pas = 5;
		var field = "x"; // On varie sur l'axe x
		if (this.x == caseFiche.x) {
			field = "y"; // On varie sur l'axe y
		}
		var _self = this;
		var distance = Math.abs(caseFiche[field] - this[field]);
		var sens = (caseFiche[field] > this[field]) ? 1 : -1;
		this.currentInterval = setInterval(function () {
			if (distance > 0) {
				_self[field] += pas * sens;
				distance -= pas;
			} else {
				// Traitement fini
				_self.y = caseFiche.y;
				_self.x = caseFiche.x;
				clearInterval(_self.currentInterval);
				_self.currentInterval = null;
				_self.goto(axe, pos, callback);
			}
		}, 30);
	}

	this.gotoDirect = function(axe, pos, callback){
		if (axe == null || pos == null) {
			return;
		}
		if (this.currentInterval != null) {
			// Wait before retry
			setTimeout(()=>this.gotoDirect(axe,pos,callback),500);
			return;
			//throw `Impossible de realiser ce deplacement direct axe:${axe}, pos:${pos}, interval:${this.currentInterval}`;
		}
		// On calcule la fonction affine
		var p1 = GestionFiche.getById(this.axe + "-" + this.pos).drawing.getCenter();
		var p2 = GestionFiche.getById(axe + "-" + pos).drawing.getCenter();
		// Si meme colonne, (x constant), on ne fait varier que y
		if (p1.x == p2.x) {
			var y = p1.y;
			var sens = (p1.y > p2.y) ? -1 : 1;
			// On fait varier x et on calcule y. Le pas est 30
			var _self = this;
			this.currentInterval = setInterval(function () {
				if ((sens < 0 && _self.y <= p2.y) || (sens > 0 && _self.y >= p2.y)) {
					_self.axe = axe;
					_self.pos = pos;
					clearInterval(_self.currentInterval);
					_self.currentInterval = null;
					if (callback) {
						callback();
					}
					return;
				}
				_self.y += 30 * ((sens < 0) ? -1 : 1);
			}, 30);
		} else {
			var pente = (p1.y - p2.y) / (p1.x - p2.x);
			var coef = p2.y - pente * p2.x;
			var x = p1.x;
			var sens = (p1.x > p2.x) ? -1 : 1;

			// On fait varier x et on calcule y. Le pas est 30
			var _self = this;
			this.currentInterval = setInterval(function () {
				if ((sens < 0 && x <= p2.x) || (sens > 0 && x >= p2.x)) {
					_self.x = p2.x;
					_self.y = p2.y;
					_self.axe = axe;
					_self.pos = pos;
					clearInterval(_self.currentInterval);
					_self.currentInterval = null;
					if (callback) {
						callback();
					}
					return;
				}
				_self.x = x;
				_self.y = pente * x + coef;
				x += 30 * ((sens < 0) ? -1 : 1);
			}, 30);
		}

	}

	this._toNextCase = function () {
		this.pos++;
		if (this.pos >= 10) {
			this.axe = (this.axe + 1) % 4;
			this.pos = 0;
		}
		return GestionFiche.getById(this.axe + "-" + this.pos).drawing.getCenter();
	}

	this.init(2,0);
}

let axeDrawer = [
	{
		axe:0,
		color:(canvas,x,y,width,b,l,h)=>canvas.fillRect(x, y + h - b, width, b),
		title:(canvas,x,y,title,dec,l,h)=>DrawerHelper.writeText(title, x + l, y + h- dec, Math.PI, canvas),
		prix:(canvas,x,y,prix,dec,l)=>DrawerHelper.writeText(prix, x + l, y + dec, Math.PI, canvas),
		image:(canvas,x,y,image,dec,l,lng,h,r)=>DrawerHelper.drawImage(canvas, image, x + l - lng, y + h - dec, image.width, image.height,r),
		maison:(canvas,x,y,img,i,l,h)=>DrawerHelper.drawImage(canvas, img, x + l - 15 * i - 3, y + h - 2, 15, 15, -Math.PI),
		hotel:(canvas,x,y,img,l,pad,h)=>DrawerHelper.drawImage(canvas, img, x + l - pad, y + h, 18, 18, -Math.PI),
		possede:(canvas,x,y,color,rayon,l)=>{
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x+l, y:y},Math.PI/2,Math.PI);
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x, y:y},0,Math.PI/2);
		}
	},
	{
		axe:1,
		color:(canvas,x,y,width,b,l)=>canvas.fillRect(x, y, b, l),
		title:(canvas,x,y,title,dec,l)=>DrawerHelper.writeText(title, x + dec, y + l, -Math.PI / 2, canvas),
		prix:(canvas,x,y,prix,dec,l,h)=>DrawerHelper.writeText(prix, x + h - dec, y + l, -Math.PI / 2, canvas),
		image:(canvas,x,y,image,dec,l,lng,h,r)=>DrawerHelper.drawImage(canvas, image, x + dec, y + l - lng, image.width, image.height, r),
		maison:(canvas,x,y,img,i,l)=>DrawerHelper.drawImage(canvas, img,x + 3, y + l - 2 - 15 * i, 15, 15, -Math.PI / 2),
		hotel:(canvas,x,y,img,l,pad)=>DrawerHelper.drawImage(canvas, img,y,y + l - pad, 18, 18, -Math.PI / 2),
		possede:(canvas,x,y,color,rayon,l,h)=>{
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x+h, y:y+l},Math.PI,3*Math.PI/2);
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x+h, y:y},Math.PI/2,Math.PI);
		}
	},
	{
		axe:2,
		color:(canvas,x,y,width,b)=>canvas.fillRect(x,y, width, b),
		title:(canvas,x,y,title,dec)=>DrawerHelper.writeText(title, x,y + dec, 0, canvas),
		prix:(canvas,x,y,prix,dec,l,h)=>DrawerHelper.writeText(prix, x,y + h - dec, 0, canvas),
		image:(canvas,x,y,image,dec,l,lng,h,r)=>DrawerHelper.drawImage(canvas, image, x + lng, y + dec, image.width, image.height, r),
		maison:(canvas,x,y,img,i)=>DrawerHelper.drawImage(canvas, img,x + 3 + 15 * i, y + 2, 15, 15, 0),
		hotel:(canvas,x,y,img,l,pad)=>DrawerHelper.drawImage(canvas, img,x + pad, y, 18, 18, 0),
		possede:(canvas,x,y,color,rayon,l,h)=>{
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x, y:y+h},3*Math.PI/2,0);
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x+l, y:y+h},Math.PI,3*Math.PI/2);
		}
	},
	{
		axe:3,
		color:(canvas,x,y,width,b,l,h)=>canvas.fillRect(x + h - b, y, b,l),
		title:(canvas,x,y,title,dec,l,h)=>DrawerHelper.writeText(title, x + h - dec, y, Math.PI / 2, canvas),
		prix:(canvas,x,y,prix,dec)=>DrawerHelper.writeText(prix, x + dec, y, Math.PI / 2, canvas),
		image:(canvas,x,y,image,dec,l,lng,h,r)=>DrawerHelper.drawImage(canvas, image, x + h - dec, y + lng, image.width, image.height, r),
		maison:(canvas,x,y,img,i,l,h)=>DrawerHelper.drawImage(canvas, img,x + h - 3, y + 2 + 15 * i, 15, 15, Math.PI / 2),
		hotel:(canvas,x,y,img,l,pad,h)=>DrawerHelper.drawImage(canvas, img,x + h, y + pad, 18, 18, Math.PI / 2),
		possede:(canvas,x,y,color,rayon,l)=>{
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x, y:y+l},3*Math.PI/2,0);
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x,y:y},0,Math.PI/2);
		}
	},
];

/* Representation graphique d'une fiche */
/* Image contient src, height et width */
function Case(pos, axe, color, title, prix, img) {
	Component.apply(this);
	this.data = {};
	this.pos = pos;
	this.axe = axe;
	this.nbMaison = 0; // Maisons a afficher sur la propriete
	this.imgMaison = new Image();
	this.imgHotel = new Image();
	this.colorPossede = null;	// Permet d'afficher une information sur le fait que le terrain est possede
	this.rayon = 10;

	this.setNbMaison = function(nbMaison){
		this.nbMaison = nbMaison;
	}

	this.init = function () {
		this.imgMaison.src = "img/maison.png";
		this.imgHotel.src = "img/hotel.png";
		var centre = DrawerFactory.dimensions.plateauSize/2;
		var largeur = DrawerFactory.dimensions.largeur;
		var hauteur = DrawerFactory.dimensions.hauteur;
		var demiLargeurPlateau = (largeur * 9) / 2;
		if (axe % 2 === 1) { // E et 0
			// height et width inverse
			this.data.height = largeur;
			this.data.width = hauteur;
			if (axe === 1) {
				this.data.x = centre + demiLargeurPlateau;
				this.data.y = centre + (pos - 5.5) * largeur;
			} else {
				this.data.x = centre - demiLargeurPlateau - hauteur;
				this.data.y = centre + (4.5 - pos) * largeur;
			}
		} else { // N et S
			this.data.height = hauteur;
			this.data.width = largeur;
			if (axe === 2) {
				this.data.y = centre + demiLargeurPlateau;
				this.data.x = centre + (4.5 - pos) * largeur;
			} else {
				this.data.y = centre - demiLargeurPlateau - hauteur;
				this.data.x = centre + (pos - 5.5) * largeur;
			}
		}
		if (img != null) {
			var image = new Image();
			// When image is well loaded, reload base canvas
			image.addEventListener('load',()=>{
				$.trigger('refreshPlateau');
			});
			image.src = img.src;
			image.height = img.height;
			image.width = img.width;
			image.margin = img.margin;
			this.data.image = image;
		}
	}

	/* Recupere les coordonnees du centre de la case */
	this.getCenter = function () {
		return {
			x: this.data.x + this.data.width / 2,
			y: this.data.y + this.data.height / 2
		};
	};

	this.draw = function (canvas) {
		var bordure = DrawerFactory.dimensions.bordure/2;
		var largeur = DrawerFactory.dimensions.largeur;
		var hauteur = DrawerFactory.dimensions.hauteur;
		canvas.strokeStyle = '#000000';
		canvas.strokeRect(this.data.x, this.data.y, this.data.width, this.data.height);
		var drawer = axeDrawer[axe];
		if (color != null) {
			canvas.fillStyle = color;
			drawer.color(canvas,this.data.x,this.data.y,this.data.width,bordure,largeur,hauteur);
		}

		if (title != null) {
			let dec = 10 + ((color != null) ? bordure : 0); // Uniquement si couleur
			drawer.title(canvas,this.data.x,this.data.y,title,dec,largeur,hauteur);
		}
		if (prix != null) {
			drawer.prix(canvas,this.data.x,this.data.y,prix,5,largeur,hauteur);
		}
		if (this.data.image != null) {
			var rotate = (Math.PI / 2) * ((this.axe + 2) % 4);
			var lng = (largeur - this.data.image.width) / 2;
			let dec = 10 + ((color != null) ? bordure : 10) + ((title != null) ? 10 : 0) + (this.data.image.margin || 0);
			drawer.image(canvas,this.data.x,this.data.y,this.data.image,dec,largeur,lng,hauteur,rotate);
		}
		// Cas des maisons
		if (this.nbMaison <= 4) {
			// On ecrit de droite a gauche dans le cartouche
			canvas.fillStyle = '#00FF00';
			for (var i = 0; i < this.nbMaison; i++) {
				drawer.maison(canvas,this.data.x,this.data.y,this.imgMaison,i,largeur,hauteur);
			}
		} else {
			// Cas de l'hotel, 5 maisons
			let pad = (largeur - 18) / 2;
			drawer.hotel(canvas,this.data.x,this.data.y,this.imgHotel,largeur,pad,hauteur);
		}
		if (this.colorPossede != null) {
			drawer.possede(canvas,this.data.x,this.data.y,this.colorPossede,this.rayon,largeur,hauteur);
		}
	};

	this.setJoueur = function(joueur){
		this.colorPossede = null;
		if(joueur!=null){
			this.colorPossede = joueur.color;
		}
	}

	// Nombre de joueur sur la case
	this.getNbJoueurs = function () {
		var count = 0;
		GestionJoueur.forEach(function(j){
			count+=(j.pion.axe === this.axe && j.pion.position === this.pos)?1:0;
		},this);
		return count;
	}

	// Retourne le decalage d'un pion sur la case
	/* @param inverse : decalage inverse (remise en place) */
	this._decalagePion = function () {
		var bordure = DrawerFactory.dimensions.bordure/2;
		var dec = 20 + ((color != null) ? bordure : 0) + DrawerFactory.dimensions.largeurPion / 2;
		var center = this.getCenter();
		center.x += 5;
		var pas = {
			x: DrawerFactory.dimensions.largeurPion,
			y: (this.data.height - dec) / 3
		}
		var nb = this.getNbJoueurs() - 1;
		if (this.axe % 2 == 0) {
			return {
				x: (center.x + ((nb % 3) - 1) * pas.y),
				y: ((nb < 3) ? center.y - pas.x : center.y + pas.x)
			};
		}
		return {
			x: ((nb < 3) ? center.x - pas.x : center.x + pas.x),
			y: (center.y + ((nb % 3) - 1) * pas.y)
		};
	}
	this.init();
}

/* Represente une case speciale */
function CaseSpeciale(axe, titre) {
	Case.call(this, 0, axe, null, titre);
	this.titre = titre;
	this.data = {};
	this.init = function () {
		var largeur = DrawerFactory.dimensions.largeur;
		var hauteur = DrawerFactory.dimensions.hauteur;
		var centre = DrawerFactory.dimensions.plateauSize/2;
		var demiLargeurPlateau = (largeur * 9) / 2;
		if (axe % 2 === 1) { // E et 0
			// height et width inverse
			if (axe === 1) {
				this.data.x = centre + demiLargeurPlateau;
				this.data.y = centre + -4.5 * largeur - hauteur;
			} else {
				this.data.x = centre - demiLargeurPlateau - hauteur;
				this.data.y = centre + 4.5 * largeur;
			}
		} else { // N et S
			if (axe === 2) {
				this.data.y = centre + demiLargeurPlateau;
				this.data.x = centre + 4.5 * largeur;
			} else {
				this.data.y = centre - demiLargeurPlateau - hauteur;
				this.data.x = centre - 4.5 * largeur - hauteur;
			}
		}
		this.data.height = this.data.width = hauteur;
	};
	this.getCenter = function () {
		return {
			x: this.data.x + this.data.height / 2,
			y: this.data.y + this.data.height / 2
		};
	};
	this.draw = function (canvas) {
		canvas.strokeStyle = '#000000';
		canvas.strokeRect(this.data.x, this.data.y, this.data.width, this.data.height);
		DrawerHelper.writeText(this.titre, this.data.x, this.data.y + DrawerFactory.dimensions.hauteur / 2, 0, canvas, 9, this.data.width);
	};
	this.init();
}

function NewImage(path){
	let img = new Image();
	img.src="img/bus.png";
	return img;
}

function DesRapide(x,y,width){
	Des.call(this,x,y,width);
	this.imgBus = NewImage('img/bus.png');
	this.imgMr = NewImage('img/mr_monopoly.png');
	this.margin = width*0.1;
	this.draw = function(canvas){
		this._drawCadre(canvas);
		if (this.value == null) {
			return;
		}
		if (this.value === 1 || this.value === 3) {
			this.drawPoint(canvas, x + width / 2, y + width / 2, width / 5, this.color);
		}
		if (this.value === 2 || this.value === 3) {
			this.drawPoint(canvas, x + width * 0.25, y + width * 0.75, width / 5, this.color);
			this.drawPoint(canvas, x + width * 0.75, y + width * 0.25, width / 5, this.color);
		}
		if(this.value === 4 || this.value === 6){
			// Bus
			DrawerHelper.drawImage(canvas, this.imgBus, x + this.margin, y + this.margin, width - this.margin, width - this.margin, 0);
		}
		if(this.value === 5){
			// Mr monopoly
			DrawerHelper.drawImage(canvas, this.imgMr, x + this.margin, y + this.margin, width - this.margin, width - this.margin, 0);
		}
	}
}

/* Represente un dé physique */
function Des(x, y, width) {
	this.value = 0;
	this.coin = 15;
	this.width = width - 2 * this.coin;
	this.setValue = function (value, color) {
		this.value = value;
		this.color = color || '#000000';
	};
	this.draw = function (canvas) {
		// Structure du des
		this._drawCadre(canvas);
		if (this.value == null) {
			return;
		}
		if (this.value % 2 === 1) {
			this.drawPoint(canvas, x + width / 2, y + width / 2, width / 5, this.color);
		}
		if (this.value !== 1) {
			this.drawPoint(canvas, x + width * 0.25, y + width * 0.75, width / 5, this.color);
			this.drawPoint(canvas, x + width * 0.75, y + width * 0.25, width / 5, this.color);
		}
		if (this.value >= 4) {
			this.drawPoint(canvas, x + width * 0.75, y + width * 0.75, width / 5, this.color);
			this.drawPoint(canvas, x + width * 0.25, y + width * 0.25, width / 5, this.color);
		}
		if (this.value === 6) {
			this.drawPoint(canvas, x + width * 0.75, y + width * 0.5, width / 5, this.color);
			this.drawPoint(canvas, x + width * 0.25, y + width * 0.5, width / 5, this.color);
		}
	}
	this._drawCadre = function(canvas){
		canvas.strokeStyle = '#000000';
		canvas.fillStyle = '#000000';
		canvas.beginPath();
		canvas.moveTo(x + this.coin, y);
		canvas.lineTo(x + this.coin + this.width, y);
		canvas.bezierCurveTo(x + this.coin * 2 + this.width, y, x + this.coin * 2 + this.width, y + this.coin, x + this.coin * 2 + this.width, y + this.coin);
		canvas.lineTo(x + this.coin * 2 + this.width, y + this.coin + this.width);
		canvas.bezierCurveTo(x + this.coin * 2 + this.width, y + this.coin * 2 + this.width, x + this.width + this.coin, y + this.coin * 2 + this.width, x + this.width + this.coin, y + this.coin * 2 + this.width);
		canvas.lineTo(x + this.coin, y + this.coin * 2 + this.width);
		canvas.bezierCurveTo(x, y + this.coin * 2 + this.width, x, y + this.coin + this.width, x, y + this.coin + this.width);
		canvas.lineTo(x, y + this.coin);
		canvas.bezierCurveTo(x, y, x + this.coin, y, x + this.coin, y);
		canvas.stroke();
		canvas.closePath();
	}
	// Dessine un point
	this.drawPoint = function (canvas, x, y, width, color) {
		canvas.strokeStyle = color || '#000000';
		canvas.fillStyle = color || '#000000';
		canvas.beginPath();
		canvas.arc(x, y, width / 2, 0, 2 * Math.PI);
		canvas.fill();
		canvas.closePath();
	}
}

function Plateau(x,y,width,height,color){
	Component.apply();
	this.canvas = null;
	this.data = {
		x: x,
		y: y,
		width: width,
		height: height
	};

	this.draw = function (canvas) {
		this.canvas = canvas;
		canvas.fillStyle = color;
		canvas.fillRect(this.data.x, this.data.y, this.data.width, this.data.height);
	};

	this.enableCaseDetect = function(callback){
		var plateau = this;
		$('canvas').unbind('mousedown').bind('mousedown',function(event){
			var offset = $(this).offset();
			var fiche = plateau._findFiche(event.clientX - offset.left,event.clientY - offset.top);
			if(fiche!=null){
				plateau.disableCaseDetect();
				callback(fiche);
			}
		});
	}
	this.disableCaseDetect = function(){
		$('canvas').unbind('mousedown');
	}
	this._findFiche = function(x,y){
		var fiche = null;
		GestionFiche.fiches.forEach(function(f){
			var data = f.drawing.data;
			if(x >= data.x && x<= (data.x + data.width) && y >= data.y && y <= (data.y + data.height)){
				fiche = f;
			}
		});
		return fiche;
	}
}

function initSquareInstance(){
	var instance = {
		type:'square',
		standardCase:Case,
		specialCase:CaseSpeciale,
		pionJoueur:PionJoueur,
		des:Des,
		desRapide:DesRapide,
		plateau:Plateau,
		endPlateau:null
	};
	DrawerFactory.addInstance(instance);
	DrawerFactory.type = instance.type;
}

$(function(){initSquareInstance();});