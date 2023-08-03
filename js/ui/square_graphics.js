import {DrawerFactory,DrawerHelper,Component} from "./graphics.js";
import {GestionFiche} from "../display/case_jeu.js";
import {VARIANTES} from "../core/monopoly.js";
import {GestionJoueur} from "../core/gestion_joueurs.js";
import {bus} from "../bus_message.js";

/* Implementation pour plateau carree */

/* Represente un pion d'un joueur */
// TODO : sortir GestionFiche

class PionJoueur extends Component{
	constructor(color, largeur,img,joueur){
		super();
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
		if(img != null){
			this.img = new Image();
			this.img.src = img;
			this.largeur+=6;
		}
		this.init(2,0);
	}

	init(axe,pos){
		let id = axe + "-" + pos;
		this.axe = axe;
		this.pos = pos;
		this.x = GestionFiche.getById(id).drawing.getCenter().x;
		this.y = GestionFiche.getById(id).drawing.getCenter().y;
	}

	draw(canvas) {
		// If dead, show nothing
		if(this.joueur.defaite){return;}
		if(this.isSelected){
			DrawerHelper.drawCircle(canvas,this.color,(this.largeur+22) / 2,{x:this.x,y:this.y},"#FF0000");
			DrawerHelper.drawCircle(canvas,"#FFFFFF",(this.largeur+18) / 2,{x:this.x,y:this.y},"#FF0000");
		}
		if(this.img!=null){
			DrawerHelper.drawImage(canvas, this.img, this.x-this.largeur/2, this.y-this.largeur/2, this.largeur, this.largeur, 0);
		}
		else{
			DrawerHelper.drawCircle(canvas,this.color,this.largeur / 2,{x:this.x,y:this.y},"#FF0000");
		}
		DrawerHelper.drawCircle(canvas,"#FFFFFF",2,{x:this.x,y:this.y},"#FF0000");
	}

	setSelected(value){
		this.isSelected = value;
	}

	// Se dirige vers une cellule donnee. Se deplace sur la case suivante et relance l'algo
	goto(axe, pos, callback,init,direct=VARIANTES.quickMove) {
		if(direct){
			return this.gotoDirect(axe,pos,callback);
		}
		if (this.currentInterval != null) {
			return setTimeout(()=>this.goto(axe,pos,callback,init),500);
			//throw "Impossible de realiser ce deplacement primaire";
		}
		// Cas initial
		if(init){
			let center = GestionFiche.getById(this.axe + "-" + this.pos).drawing.getCenter();
			this.x = center.x;
			this.y = center.y;
		}
		// Cas de la fin
		if (this.axe === axe && this.pos === pos) {
			let decalage = GestionFiche.getById(this.axe + "-" + this.pos).drawing._decalagePion();
			this.x = decalage.x;
			this.y = decalage.y;
			if (callback) {
				callback();
			}
			return;
		}
		const caseFiche = this._toNextCase();
		const pas = 5;
		let field = "x"; // On varie sur l'axe x
		if (this.x === caseFiche.x) {
			field = "y"; // On varie sur l'axe y
		}
		let distance = Math.abs(caseFiche[field] - this[field]);
		const sens = (caseFiche[field] > this[field]) ? 1 : -1;
		this.currentInterval = setInterval(()=> {
			if (distance > 0) {
				this[field] += pas * sens;
				distance -= pas;
			} else {
				// Traitement fini
				this.y = caseFiche.y;
				this.x = caseFiche.x;
				clearInterval(this.currentInterval);
				this.currentInterval = null;
				this.goto(axe, pos, callback);
			}
		}, 30);
	}

	gotoDirect(axe, pos, callback){
		if (axe == null || pos == null) {
			return;
		}
		if (this.currentInterval != null) {
			// Wait before retry
			return setTimeout(()=>this.gotoDirect(axe,pos,callback),500);
		}
		// On calcule la fonction affine
		let p1 = GestionFiche.getById(this.axe + "-" + this.pos).drawing.getCenter();
		let p2 = GestionFiche.getById(axe + "-" + pos).drawing.getCenter();
		// Si meme colonne, (x constant), on ne fait varier que y
		if (p1.x === p2.x) {
			let sens = (p1.y > p2.y) ? -1 : 1;
			// On fait varier x et on calcule y. Le pas est 30
			this.currentInterval = setInterval(()=> {
				if ((sens < 0 && this.y <= p2.y) || (sens > 0 && this.y >= p2.y)) {
					return this._endMove(axe,pos,callback);
				}
				this.y += 30 * ((sens < 0) ? -1 : 1);
			}, 30);
		} else {
			let pente = (p1.y - p2.y) / (p1.x - p2.x);
			let coef = p2.y - pente * p2.x;
			let x = p1.x;
			let sens = (p1.x > p2.x) ? -1 : 1;

			// On fait varier x et on calcule y. Le pas est 30
			this.currentInterval = setInterval(() =>{
				if ((sens < 0 && x <= p2.x) || (sens > 0 && x >= p2.x)) {
					this.x = p2.x;
					this.y = p2.y;
					return this._endMove(axe,pos,callback);
				}
				this.x = x;
				this.y = pente * x + coef;
				x += 30 * ((sens < 0) ? -1 : 1);
			}, 30);
		}
	}
	_endMove(axe,pos,callback = ()=>{}){
		this.axe = axe;
		this.pos = pos;
		clearInterval(this.currentInterval);
		this.currentInterval = null;
		callback();
	}

	_toNextCase() {
		this.pos++;
		if (this.pos >= DrawerFactory.dimensions.nbCases) {
			this.axe = (this.axe + 1) % 4;
			this.pos = 0;
		}
		return GestionFiche.getById(this.axe + "-" + this.pos).drawing.getCenter();
	}
}

let axeDrawer = [
	{
		axe:0,
		color:(canvas,x,y,width,b,l,h)=>canvas.fillRect(x, y + h - b, width, b),
		title:(canvas,x,y,title,dec,l,h)=>DrawerHelper.writeText(title, x + l, y + h- dec, Math.PI, canvas,DrawerFactory.dimensions.textSize),
		prix:(canvas,x,y,prix,dec,l)=>DrawerHelper.writeText(prix, x + l, y + dec, Math.PI, canvas,DrawerFactory.dimensions.textSize),
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
		title:(canvas,x,y,title,dec,l)=>DrawerHelper.writeText(title, x + dec, y + l, -Math.PI / 2, canvas,DrawerFactory.dimensions.textSize),
		prix:(canvas,x,y,prix,dec,l,h)=>DrawerHelper.writeText(prix, x + h - dec, y + l, -Math.PI / 2, canvas,DrawerFactory.dimensions.textSize),
		image:(canvas,x,y,image,dec,l,lng,h,r)=>DrawerHelper.drawImage(canvas, image, x + dec, y + l - lng, image.width, image.height, r),
		maison:(canvas,x,y,img,i,l)=>DrawerHelper.drawImage(canvas, img,x + 3, y + l - 2 - 15 * i, 15, 15, -Math.PI / 2),
		hotel:(canvas,x,y,img,l,pad)=>DrawerHelper.drawImage(canvas, img,x,y + l - pad, 18, 18, -Math.PI / 2),
		possede:(canvas,x,y,color,rayon,l,h)=>{
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x+h, y:y+l},Math.PI,3*Math.PI/2);
			DrawerHelper.drawArcCircle(canvas,color,rayon,{x:x+h, y:y},Math.PI/2,Math.PI);
		}
	},
	{
		axe:2,
		color:(canvas,x,y,width,b)=>canvas.fillRect(x,y, width, b),
		title:(canvas,x,y,title,dec)=>DrawerHelper.writeText(title, x,y + dec, 0, canvas,DrawerFactory.dimensions.textSize),
		prix:(canvas,x,y,prix,dec,l,h)=>DrawerHelper.writeText(prix, x,y + h - dec, 0, canvas,DrawerFactory.dimensions.textSize),
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
		title:(canvas,x,y,title,dec,l,h)=>DrawerHelper.writeText(title, x + h - dec, y, Math.PI / 2, canvas,DrawerFactory.dimensions.textSize),
		prix:(canvas,x,y,prix,dec)=>DrawerHelper.writeText(prix, x + dec, y, Math.PI / 2, canvas,DrawerFactory.dimensions.textSize),
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
class Case extends Component {
	constructor(pos, axe, color, title, prix, img){
		super();
		this.data = {};
		this.axe = axe;
		this.color = color;
		this.title = title;
		this.prix = prix;
		this.nbMaison = 0; // Maisons a afficher sur la propriete
		this.imgMaison = new Image();
		this.imgHotel = new Image();
		this.colorPossede = null;	// Permet d'afficher une information sur le fait que le terrain est possede
		this.rayon = 10;
		this.init(pos,axe,img);
	}

	setNbMaison(nbMaison){
		this.nbMaison = nbMaison;
	}

	init(pos,axe,img) {
		this.imgMaison.src = "img/maison.png";
		this.imgHotel.src = "img/hotel.png";
		let centre = DrawerFactory.dimensions.plateauSize/2;
		let largeur = DrawerFactory.dimensions.largeur;
		let hauteur = DrawerFactory.dimensions.hauteur;
		let nbHalfCases = (DrawerFactory.dimensions.nbCases-1) / 2;
		let demiLargeurPlateau = largeur * nbHalfCases;
		if (axe % 2 === 1) { // E et 0
			// height et width inverse
			this.data.height = largeur;
			this.data.width = hauteur;
			if (axe === 1) {
				this.data.x = centre + demiLargeurPlateau;
				this.data.y = centre + (pos - nbHalfCases - 1) * largeur;
			} else {
				this.data.x = centre - demiLargeurPlateau - hauteur;
				this.data.y = centre + (nbHalfCases - pos) * largeur;
			}
		} else { // N et S
			this.data.height = hauteur;
			this.data.width = largeur;
			if (axe === 2) {
				this.data.y = centre + demiLargeurPlateau;
				this.data.x = centre + (nbHalfCases - pos) * largeur;
			} else {
				this.data.y = centre - demiLargeurPlateau - hauteur;
				this.data.x = centre + (pos - nbHalfCases- 1) * largeur;
			}
		}
		this._initImage(img);
	}
	_initImage(img){
		if (img != null) {
			let image = new Image();
			// When image is well loaded, reload base canvas
			image.addEventListener('load',()=>{
				bus.refresh();
			});
			image.src = img.src;
			image.height = img.height;
			image.width = img.width;
			image.margin = img.margin;
			this.data.image = image;
		}
	}

	/* Recupere les coordonnees du centre de la case */
	getCenter() {
		return {
			x: this.data.x + this.data.width / 2,
			y: this.data.y + this.data.height / 2
		};
	};

	draw (canvas) {
		const bordure = DrawerFactory.dimensions.bordure/2;
		const largeur = DrawerFactory.dimensions.largeur;
		const hauteur = DrawerFactory.dimensions.hauteur;
		canvas.strokeStyle = '#000000';
		canvas.strokeRect(this.data.x, this.data.y, this.data.width, this.data.height);
		let drawer = axeDrawer[this.axe];
		if (this.color != null) {
			canvas.fillStyle = this.color;
			drawer.color(canvas,this.data.x,this.data.y,this.data.width,bordure,largeur,hauteur);
		}

		if (this.title != null) {
			let dec = 12 + ((this.color != null) ? bordure : 0); // Uniquement si couleur
			drawer.title(canvas,this.data.x,this.data.y,this.title,dec,largeur,hauteur);
		}
		if (this.prix != null) {
			drawer.prix(canvas,this.data.x,this.data.y,this.prix,5,largeur,hauteur);
		}
		if (this.data.image != null) {
			const rotate = (Math.PI / 2) * ((this.axe + 2) % 4);
			const lng = (largeur - this.data.image.width) / 2;
			const dec = 10 + ((this.color != null) ? bordure : 10) + ((this.title != null) ? 10 : 0) + (this.data.image.margin || 0);
			drawer.image(canvas,this.data.x,this.data.y,this.data.image,dec,largeur,lng,hauteur,rotate);
		}
		// Cas des maisons
		if (this.nbMaison <= 4) {
			// On ecrit de droite a gauche dans le cartouche
			canvas.fillStyle = '#00FF00';
			for (let i = 0; i < this.nbMaison; i++) {
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

	setJoueur (joueur){
		this.colorPossede = null;
		if(joueur!=null){
			this.colorPossede = joueur.color;
		}
	}

	// Nombre de joueur sur la case
	getNbJoueurs() {
		let count = 0;
		GestionJoueur.forEach(function(j){
			count+=(j.pion.axe === this.axe && j.pion.position === this.pos)?1:0;
		},this);
		return count;
	}

	// Retourne le decalage d'un pion sur la case
	/* @param inverse : decalage inverse (remise en place) */
	_decalagePion() {
		const bordure = DrawerFactory.dimensions.bordure/2;
		const dec = 20 + ((this.color != null) ? bordure : 0) + DrawerFactory.dimensions.largeurPion / 2;
		const center = this.getCenter();
		center.x += 5;
		let pas = {
			x: DrawerFactory.dimensions.largeurPion,
			y: (this.data.height - dec) / 3
		};
		let nb = this.getNbJoueurs() ;
		if (this.axe % 2 === 0) {
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
}

/* Represente une case speciale */
class CaseSpeciale extends Case {
	constructor(axe, title){
		super(0,axe,null,title,null,null);
		this.data = {};
		this.init();
	}
	init() {
		let largeur = DrawerFactory.dimensions.largeur;
		let hauteur = DrawerFactory.dimensions.hauteur;
		let centre = DrawerFactory.dimensions.plateauSize/2;
		let nbHalfCases = (DrawerFactory.dimensions.nbCases-1) / 2;
		let demiLargeurPlateau = largeur * nbHalfCases;
		if (this.axe % 2 === 1) { // E et 0
			// height et width inverse
			if (this.axe === 1) {
				this.data.x = centre + demiLargeurPlateau;
				this.data.y = centre + -nbHalfCases * largeur - hauteur;
			} else {
				this.data.x = centre - demiLargeurPlateau - hauteur;
				this.data.y = centre + nbHalfCases * largeur;
			}
		} else { // N et S
			if (this.axe === 2) {
				this.data.y = centre + demiLargeurPlateau;
				this.data.x = centre + nbHalfCases * largeur;
			} else {
				this.data.y = centre - demiLargeurPlateau - hauteur;
				this.data.x = centre - nbHalfCases * largeur - hauteur;
			}
		}
		this.data.height = this.data.width = hauteur;
	};
	draw(canvas) {
		canvas.strokeStyle = '#000000';
		canvas.strokeRect(this.data.x, this.data.y, this.data.width, this.data.height);
		DrawerHelper.writeText(this.title, this.data.x, this.data.y + DrawerFactory.dimensions.hauteur / 2, 0, canvas, 9, this.data.width);
	};
}

function NewImage(path){
	let img = new Image();
	img.src=path;
	return img;
}

/* Represente un dé physique */
class Des {
	constructor(x, y, width){
		this.value = 0;
		this.coin = 15;
		this.width = width;
		this.compute = width - 2 * this.coin;
		this.x = x;
		this.y = y;
	}
	setValue(value, color='#000000') {
		this.value = value;
		this.color = color;
	};
	draw2or3(canvas){
		Des.drawPoint(canvas, this.x + this.width * 0.25, this.y + this.width * 0.75, this.width / 5, this.color);
		Des.drawPoint(canvas, this.x + this.width * 0.75, this.y + this.width * 0.25, this.width / 5, this.color);
	};
	_drawMiddle(canvas){
		Des.drawPoint(canvas, this.x + this.width / 2, this.y + this.width / 2, this.width / 5, this.color);
	}
	draw(canvas) {
		// Structure du des
		this._drawCadre(canvas);
		if (this.value === undefined) {
			return;
		}
		if (this.value % 2 === 1) {
			this._drawMiddle(canvas);
		}
		if (this.value !== 1) {
			this.draw2or3(canvas);
		}
		if (this.value >= 4) {
			this._drawBig(canvas,{c1:0.75,c2:0.25});
		}
		if (this.value === 6) {
			this._drawBig(canvas,{c1:0.5,c2:0.5});
		}
	}
	_drawBig(canvas,coeff){
		Des.drawPoint(canvas, this.x + this.width * 0.75, this.y + this.width * coeff.c1, this.width / 5, this.color);
		Des.drawPoint(canvas, this.x + this.width * 0.25, this.y + this.width * coeff.c2, this.width / 5, this.color);
	}
	_drawCadre(canvas){
		canvas.strokeStyle = '#000000';
		canvas.fillStyle = '#000000';
		canvas.beginPath();
		canvas.moveTo(this.x + this.coin, this.y);
		canvas.lineTo(this.x + this.coin + this.compute, this.y);
		canvas.bezierCurveTo(this.x + this.coin * 2 + this.compute, this.y, this.x + this.coin * 2 + this.compute, this.y + this.coin, this.x + this.coin * 2 + this.compute, this.y + this.coin);
		canvas.lineTo(this.x + this.coin * 2 + this.compute, this.y + this.coin + this.compute);
		canvas.bezierCurveTo(this.x + this.coin * 2 + this.compute, this.y + this.coin * 2 + this.compute, this.x + this.compute + this.coin, this.y + this.coin * 2 + this.compute, this.x + this.compute + this.coin, this.y + this.coin * 2 + this.compute);
		canvas.lineTo(this.x + this.coin, this.y + this.coin * 2 + this.compute);
		canvas.bezierCurveTo(this.x, this.y + this.coin * 2 + this.compute, this.x, this.y + this.coin + this.compute, this.x, this.y + this.coin + this.compute);
		canvas.lineTo(this.x, this.y + this.coin);
		canvas.bezierCurveTo(this.x, this.y, this.x + this.coin, this.y, this.x + this.coin, this.y);
		canvas.stroke();
		canvas.closePath();
	}
	// Dessine un point
	static drawPoint(canvas, x, y, width, color='#000000') {
		canvas.strokeStyle = color;
		canvas.fillStyle = color;
		canvas.beginPath();
		canvas.arc(x, y, width / 2, 0, 2 * Math.PI);
		canvas.fill();
		canvas.closePath();
	}
}

class DesRapide extends Des{
	constructor(x,y,width){
		super(x,y,width);
		this.imgBus = NewImage('img/bus.png');
		this.imgMr = NewImage('img/mr_monopoly.png');
		this.margin = width*0.1;
	}
	draw(canvas){
		this._drawCadre(canvas);
		if (this.value === undefined) {
			return;
		}
		if (this.value === 1 || this.value === 3) {
			this._drawMiddle(canvas);
		}
		if (this.value === 2 || this.value === 3) {
			this.draw2or3(canvas);
		}
		if(this.value >=4) {
			let img = (this.value === 5)?this.imgBus:this.imgMr;
			DrawerHelper.drawImage(canvas, img, this.x + this.margin, this.y + this.margin, this.width - this.margin, this.width - this.margin, 0);
		}
	}
}

class Plateau extends Component{
	constructor(x,y,width,height,color) {
		super();
		this.canvas = null;
		this.data = {
			x: x,
			y: y,
			width: width,
			height: height,
			color:color
		};
	}

	draw(canvas) {
		this.canvas = canvas;
		canvas.fillStyle = this.data.color;
		canvas.fillRect(this.data.x, this.data.y, this.data.width, this.data.height);
	};

	enableCaseDetect(callback){
		let plateau = this;
		$('canvas').unbind('mousedown').bind('mousedown',function(event){
			let offset = $(this).offset();
			let fiche = plateau._findFiche(event.clientX - offset.left,event.clientY - offset.top);
			if(fiche!=null){
				plateau.disableCaseDetect();
				callback(fiche);
			}
		});
	}
	disableCaseDetect(){
		$('canvas').unbind('mousedown');
	}
	_findFiche(x,y){
		let fiche = null;
		GestionFiche.fiches.forEach(function(f){
			let data = f.drawing.data;
			if(x >= data.x && x<= (data.x + data.width) && y >= data.y && y <= (data.y + data.height)){
				fiche = f;
			}
		});
		return fiche;
	}
}

function initSquareInstance(){
	const instance = {
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

export {Des,DesRapide};