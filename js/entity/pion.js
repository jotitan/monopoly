/* Objet PION */
import {DrawerFactory,Drawer} from "../ui/graphics.js";
import {GestionJoueur} from "../core/gestion_joueurs.js";
import {VARIANTES} from "../core/monopoly.js";
import {bus} from "../bus_message.js";

function Pion(color, joueur,img, montantDepart = 20000) {
	this.axe = 2;
	this.position = 0;
	this.joueur = joueur;
	this.montantDepart = montantDepart;
	this.stats = {
		tour: 0,
		prison: 0,
		positions:[]
	}; // stat du joueur
	this.pion = DrawerFactory.getPionJoueur(color,DrawerFactory.dimensions.largeurPion,img,this.joueur);
	Drawer.addRealTime(this.pion);

	/* Supprime le pion en cas de defaite */
	this.remove = function () {
		Drawer.removeComponent(this.pion);
	}

	// Ca directement en prison, sans passer par la case depart, en coupant
	this.goPrison = function (callback) {
		this.stats.prison++;
		// Manque le callback
		this.goDirectToCell(3, 0, callback);
	}

	this.deplaceValeursDes = function (des) {
		let pos = this.position + des;
		let axe = this.axe;
		while(pos<0){
			pos+=DrawerFactory.dimensions.nbCases;
			axe= (axe + 3)%4;
		}
		while (pos >= DrawerFactory.dimensions.nbCases) {
			pos -= DrawerFactory.dimensions.nbCases;
			axe = (axe + 1) % 4;
		}
		return {
			pos: pos,
			axe: axe
		}
	};

	this.goto = function (axe, pos, call,direct=VARIANTES.quickMove,primeDepart=true) {
		let id = axe+"-"+pos;

		if(this.stats.positions[id] == null){
			this.stats.positions[id] = 1;
		}
		else{
			this.stats.positions[id]++;
		}
		if(GestionJoueur.getJoueurCourant() != null) {
			bus.debug( {
				message: `${GestionJoueur.getJoueurCourant().nom} est en ${this.axe} - ${this.position} et va en ${id}`
			});
		}
		// On gere le cas de la case depart (si elle est sur le trajet)
		let depart = this.axe*DrawerFactory.dimensions.nbCases + this.position;
		let cible = axe*DrawerFactory.dimensions.nbCases + pos;
		let caseDepart = 2*DrawerFactory.dimensions.nbCases;
		if(primeDepart && ((depart < caseDepart && cible > caseDepart) || (depart > cible && (depart < caseDepart	 || cible > caseDepart)))){
			this.treatCaseDepart();
		}
		this.axe = axe;
		this.position = pos;
		this.pion.goto(axe, pos, call,false,direct);
	};

	// Si on passe par la case depart, on prend 20000 Francs
	this.treatCaseDepart = function () {
		this.stats.tour++;
		this.joueur.gagner(this.montantDepart);
	}

	this.goDirectToCell = function (axe, pos, callback) {
		this.axe = axe;
		this.position = pos;
		this.pion.gotoDirect(axe,pos,callback);
	}
}

export {Pion};
