import {DrawerFactory,Component} from "./graphics.js";
import {Des,DesRapide} from './square_graphics.js'
import {DrawerHelper} from "./graphics.js";
import {VARIANTES} from "../monopoly.js";

/* Implementation pour plateau carree */

let pasAngle = (2 * Math.PI)/40;	// Nombre de case du jeu
let nbJoueurs = 0;	// Permet de definir la position des joueurs

function getCoords(angle,rayon){
	return {
		y:(Math.sin(angle))*rayon,
		x:(Math.cos(angle))*rayon
	}
}

function convertAxePos(axe,pos){
	return ((axe+2)%4)*10 + pos;
}

// Represente un pion d'un joueur
class CirclePionJoueur extends Component {
	constructor(color, largeur,img) {
		super();
		this.color = color;
		this.isSelected = false;
		this.largeur = largeur / 2; // Largeur du pion
		this.img = null;
		if (img != null) {
			this.img = new Image();
			this.img.src = img;
			this.largeur += 10;
		}
		this.init(2,0);
	}

	init(axe,pos){
		let center = DrawerFactory.dimensions.plateauSize/2;
		this.pos = convertAxePos(axe,pos);
		/* Gere le decalage de chaque joueur lors de la creation */
		this._rayon = center- (70 + (nbJoueurs%3)*25);
		this._angle = 0.5 + ((nbJoueurs%2)?1:-1) * 0.25;
		nbJoueurs++;
	}

	draw (canvas) {
		let centrePlateau = DrawerFactory.dimensions.plateauSize/2;
		let centre = getCoords((this.pos+this._angle)*pasAngle,this._rayon);
		if(this.isSelected){
			DrawerHelper.drawCircle(canvas,"#FFFFFF",(this.largeur+2) / 2,{x:centre.x+centrePlateau,y:centre.y+centrePlateau},"#FF0000");
		}
		if(this.img!=null){
			DrawerHelper.drawImage(canvas, this.img, centre.x+centrePlateau-this.largeur/2, centre.y+centrePlateau-this.largeur/2, this.largeur, this.largeur, 0);
		}
		else{
			DrawerHelper.drawCircle(canvas,this.color,this.largeur,{x:centre.x+centrePlateau,y:centre.y+centrePlateau},"#FF0000");
		}
	}
	setSelected (value){
		this.isSelected = value;
	}

	_moveTo (ciblePos,callback,pas){
		if(this.pos!==ciblePos){
			setTimeout(()=>{
				this.pos=parseFloat((this.pos + pas).toFixed(1));
				if(this.pos>=40){
					this.pos = 0;
				}
				this._moveTo(ciblePos,callback,pas);
			},30);
		}
		else{
			callback();
		}
	}

	// Se dirige vers une cellule donnee. Se deplace sur la case suivante et relance l'algo
	goto(axe, pos, callback) {
		if(VARIANTES.quickMove){
			return this.gotoDirect(axe,pos,callback);
		}
		let ciblePos = convertAxePos(axe,pos);
		this._moveTo(ciblePos,callback,0.1);
	}

	gotoDirect (axe, pos, callback){
		if (axe == null || pos == null) {
			return;
		}
		let ciblePos = convertAxePos(axe,pos);
		this._moveTo(ciblePos,callback,1);
	}
}

class CircleCase extends Component{
	constructor(pos, axe, color, title, prix, img) {
		super();
		this.pos = convertAxePos(axe, pos);
		this.color = color;
		this.title = title;
		this.prix = prix;
		this.img = img;
		this.nbMaison = 0;
		this.data = {};
		this.imageMaison = new Image();
		this.imageHotel = new Image();
		this.joueurPossede = null;

		this.init();
	}
	setJoueur(joueur){
		this.joueurPossede = joueur;
	}

	setNbMaison(nbMaison){
		this.nbMaison = nbMaison;
	}

	init(){
		this.imageMaison.src = "img/maison.png";
		this.imageHotel.src = "img/hotel.png";

		if (this.img != null) {
			this.img = $.extend(true,{},DrawerFactory.infos.defaultImage || {},this.img);
			let image = new Image();
			image.addEventListener('load',()=>{
				$.trigger('refreshPlateau');
			});
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

	_drawColorGroup(canvas,param){
		let bgColor = DrawerFactory.getInfo("backgroundColor");
		if(this.color!=null){
			canvas.beginPath();
			canvas.fillStyle=this.color;
			canvas.moveTo(param.centre,param.centre);
			canvas.arc(param.centre,param.centre,param.centre,(this.pos)*pasAngle,(this.pos+1)*pasAngle);
			canvas.fill();
			canvas.closePath();
			canvas.beginPath();
			canvas.fillStyle=bgColor;
			canvas.moveTo(param.centre,param.centre);
			canvas.arc(param.centre,param.centre,param.centre-param.bordure,this.pos*pasAngle,(this.pos+1)*pasAngle);
			canvas.fill();
			canvas.closePath();
		}
	}

	_drawPossede(canvas,param){
		if(this.joueurPossede!=null){
			canvas.beginPath();
			canvas.strokeStyle=this.joueurPossede.color;
			canvas.lineWidth = 10;
			canvas.arc(param.centre,param.centre,param.centre-DrawerFactory.dimensions.innerPlateauSize+15,(this.pos)*pasAngle,(this.pos+1)*pasAngle);
			canvas.stroke();
			canvas.closePath();
		}
	}
	_drawTitle(canvas,param){
		if(this.title!=null){
			if(this.pos > 10 && this.pos < 30){
				let p = getCoords((this.pos+0.7)*pasAngle,param.centre-param.bordure -5);
				DrawerHelper.writeText(this.title, p.x + param.centre,p.y + param.centre, ((this.pos+20)%40 + 0.8)*pasAngle, canvas,9,param.length,'left');
			}else{
				let length = Math.min(param.length,canvas.measureText(this.title).width + 30);
				let p = getCoords((this.pos+0.3)*pasAngle,param.centre -param.length - param.bordure -5);
				DrawerHelper.writeText(this.title, p.x + param.centre,p.y + param.centre, (this.pos + 0.2)*pasAngle, canvas,9,length,'right');
			}
		}
	}
	_drawPrice(canvas,param){
		if(this.prix!=null){
			if(this.pos > 10 && this.pos < 30){
				let p = getCoords((this.pos+0.15)*pasAngle,param.centre-param.bordure -5);
				DrawerHelper.writeText(this.prix, p.x + param.centre,p.y + param.centre, ((this.pos+20)%40 + 0.5)*pasAngle, canvas,9,param.length,'left');
			}else{
				let length = Math.min(param.length,canvas.measureText(this.prix).width + 30);
				let p = getCoords((this.pos+0.9)*pasAngle,param.centre - param.length- param.bordure -5);
				DrawerHelper.writeText(this.prix, p.x + param.centre,p.y + param.centre, (this.pos + 0.7)*pasAngle, canvas,9,length,'right');
			}
		}
	}
	_drawHouses(canvas,param){
		if(this.nbMaison <= 4){
			for(let i = 0 ; i < this.nbMaison ; i++){
				let coords = getCoords((this.pos + 0.25*i)*pasAngle,param.centre-4);
				DrawerHelper.drawImage(canvas, this.imageMaison, param.centre+coords.x, param.centre+coords.y, 16,16, this.pos*pasAngle + Math.PI/2)
			}
		}
		else{
			let coords = getCoords((this.pos + 0.4)*pasAngle,param.centre-4);
			DrawerHelper.drawImage(canvas, this.imageHotel, param.centre+coords.x, param.centre+coords.y, 16,16, this.pos*pasAngle + Math.PI/2)
		}
	}
	_drawImage(canvas,param){
		if (this.data.image != null) {
			// Margin left est defini en portion d'angle (1 correspond a la largeur de la case), margin top joue sur la longueur du rayon
			let coords = getCoords((this.pos + this.data.image.marginLeft)*pasAngle,param.centre-param.bordure -5 - this.data.image.margin);
			let angle = DrawerHelper.fromDegresToRad(this.data.image.rotate) + this.pos*pasAngle + Math.PI/2;
			DrawerHelper.drawImage(canvas, this.data.image, param.centre+coords.x, param.centre+coords.y, this.data.image.width,this.data.image.height, angle);
		}
	}

	draw(canvas){
		let centre = DrawerFactory.dimensions.plateauSize/2;
		let bordure = DrawerFactory.dimensions.bordure/2;
		let pA = getCoords(this.pos*pasAngle,centre);
		let pB = getCoords(this.pos*pasAngle,centre-DrawerFactory.dimensions.innerPlateauSize);

		canvas.fillStyle='#FFFFFF';
		canvas.lineWidth=0.5;
		canvas.moveTo(centre - pA.x,centre - pA.y);
		canvas.lineTo(centre - pB.x,centre - pB.y);
		canvas.stroke();
		let param = {centre:centre,bordure:bordure,length:140};
		this._drawColorGroup(canvas,param);
		this._drawTitle(canvas,param);
		this._drawPrice(canvas,param);
		this._drawImage(canvas,param);
		this._drawHouses(canvas,param);
		this._drawPossede(canvas,param);
	}
}

class CircleCaseSpeciale extends Component{
	constructor(axe, title){
		super();
		this.pos = convertAxePos(axe,0);
		this.title = title;
	}
	draw (canvas){
		let centre = DrawerFactory.dimensions.plateauSize/2;
		let pA = getCoords(this.pos*pasAngle,centre);
		let pB = getCoords(this.pos*pasAngle,centre-DrawerFactory.dimensions.innerPlateauSize);
		let bgColor = DrawerFactory.getInfo("backgroundColor");
		canvas.fillStyle=bgColor;
		canvas.lineWidth=0.5;
		canvas.moveTo(centre - pA.x,centre - pA.y);
		canvas.lineTo(centre - pB.x,centre - pB.y);
		canvas.stroke();
		DrawerHelper.drawArcCircle(canvas,bgColor,centre,{x:centre,y:centre},this.pos*pasAngle,(this.pos+1)*pasAngle);
		let maxLength = 120;
		if(this.title!=null){
			if(this.pos > 10 && this.pos < 30){
				let p = getCoords((this.pos+0.5)*pasAngle,centre-15);
				DrawerHelper.writeText(this.title, p.x + centre,p.y + centre, ((this.pos+20)%40 + 0.6)*pasAngle, canvas,9,maxLength,'left');
			}else{
				let p = getCoords((this.pos+0.6)*pasAngle,centre -maxLength - 15);
				DrawerHelper.writeText(this.title, p.x + centre,p.y + centre, (this.pos + 0.2)*pasAngle, canvas,9,maxLength,'right');
			}
		}
	}
}

/* Represente un dé physique */
class CircleDes extends Des {
	constructor(x, y, width) {
		super(x + 195, y + 100, width);
	}
}

class CircleDesRapide extends DesRapide{
	constructor(x,y,width) {
		super(x + 190, y + 100, width);
	}
}

class CirclePlateau extends Component{
	constructor(x,y,width,height,color){
		super();
		this.data = {
			x: x,
			y: y,
			width: width,
			height: height,
			color:color
		};
	}

	draw(canvas) {
		DrawerHelper.drawCircle(canvas,this.data.color,this.data.width/2,{x:this.data.width/2,y:this.data.width/2});
	}
}

/* Dessiné en dernier sur le plateau */
class EndCirclePlateau extends Component{
	constructor(){
		super();
	}

	draw(canvas){
		let centre = DrawerFactory.dimensions.plateauSize/2;
		let innerPlateau = DrawerFactory.dimensions.innerPlateauSize;
		DrawerHelper.drawCircle(canvas,'#000000',centre-innerPlateau,{x:centre,y:centre});
		DrawerHelper.drawCircle(canvas,'#FFFFFF',centre-innerPlateau - 2,{x:centre,y:centre});
		DrawerHelper.drawArcCircle(canvas,'#FF0000',centre-innerPlateau -2,{x:centre,y:centre},-Math.PI,0);
		DrawerHelper.drawCircle(canvas,'#FFFFFF',centre-innerPlateau - 50,{x:centre,y:centre});
	}
}

function initCircleInstance(){
	let instance = {
		type:'circle',
		standardCase:CircleCase,
		specialCase:CircleCaseSpeciale,
		pionJoueur:CirclePionJoueur,
		des:CircleDes,
		desRapide:CircleDesRapide,
		plateau:CirclePlateau,
		endPlateau:EndCirclePlateau
	};
	DrawerFactory.addInstance(instance);
}

$(function(){initCircleInstance();});