/* Cartes actions (chance ou caisse de communaute) */

class CarteAction{
	constructor(type) {
		this.type = type;
	}
	action(joueur) {
		console.error("Not implemented " + joueur,this.type);
	}
}

/* Carte chance : reparations des maisons et hotels */
class ReparationsCarte extends CarteAction{
	constructor(tarifHotel,tarifMaison) {
		super("reparation");
		this.tarifHotel = tarifHotel;
		this.tarifMaison = tarifMaison;
	}
	action(joueur){
		let stats = joueur.getStats();
		let montant = stats.hotel * this.tarifHotel + stats.maison * this.tarifMaison;
		joueur.payer(montant,()=>GestionJoueur.change());
	}
}

/* Carte chance : chaque joueur vous donne 1000 francs */
class BirthdayCarte extends CarteAction{
	constructor(montant){
		super("birthday");
		this.montant = montant;
	}
	action(joueur){
		let payers = GestionJoueur.joueurs.filter(j=>!joueur.equals(j) && !j.defaite);
		payers.forEach((j,i)=>{
			j.payerTo(this.montant,joueur,()=>{
				if(i === payers.length -1){
					GestionJoueur.change();
				}
			});
		});
	}
}

/* Action de déplacement vers une case */
/* @param direct : si renseigné a vrai, le pion est deplacé directement vers la case, sans passer par la case depart */
class GotoCarte extends CarteAction{
	constructor(axe, pos, direct,primeDepart=true) {
		super("goto");
		this.fiche = {axe:axe,pos:pos};
		this.direct = direct;
		this.primeDepart = primeDepart;
	}
	action(joueur) {
		joueur.joueSurCase(this.fiche,this.direct,this.primeDepart);
	}
}

/* Carte sortie de prison */
class PrisonCarte extends CarteAction {
	constructor() {
		super("prison");
		this.joueurPossede = null;
	}
	action = function (joueur) {
		joueur.cartesSortiePrison.push(this);
		this.joueurPossede = joueur;
		GestionJoueur.change();
	};
	isLibre = function () {
		return this.joueurPossede == null;
	}
}

/* Action de déplacement d'un certain nombre de case */
class MoveNbCarte extends CarteAction {
	constructor(nb,direct=true,primeDepart=true) {
		super("move");
		this.nb = nb;
		this.direct = direct;
		// If false, no prime on start case
		this.primeDepart = primeDepart;
	}
	action(joueur) {
		let pos = joueur.pion.deplaceValeursDes(this.nb);
		joueur.joueSurCase(pos,this.direct,this.primeDepart);
	}
}

/* Action de gain d'argent pour une carte */
class PayerCarte extends CarteAction {
	constructor(montant,plateauMonopoly) {
		super("taxe");
		this.plateauMonopoly = plateauMonopoly;
		this.montant = montant;
	}
	action(joueur) {
		joueur.payerParcGratuit(this.plateauMonopoly.parcGratuit,this.montant,  ()=>GestionJoueur.change());
	}
}

/* Action de perte d'argent pour une carte */
class GagnerCarte extends CarteAction {
	constructor(montant) {
		super("prime");
		this.montant = montant;
	}
	action(joueur){
		joueur.gagner(this.montant);
		GestionJoueur.change();
	}
}

let CarteActionFactory = {
	get:function(data, plateauMonopoly) {
		switch (data.type) {
			/* Amende a payer */
			case "taxe":
				return new PayerCarte(data.montant,plateauMonopoly);
			/* Argent a toucher */
			case "prime":
				return new GagnerCarte(data.montant);
			/* Endroit ou aller */
			case "goto":
				return new GotoCarte(data.axe, data.pos, data.direct,data.primeDepart);
			/* Deplacement a effectuer */
			case "move":
				return new MoveNbCarte(data.nb,data.direct,data.primeDepart);
			/* Carte prison */
			case "prison":
				return new PrisonCarte();
			/* Carte anniversaire */
			case "birthday":
				return new BirthdayCarte(data.montant);
			case "repair":
				return new ReparationsCarte(data.hotel,data.maison)
		}
		throw "Type inconnu";
	}
};
	

