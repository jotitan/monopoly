/* Objet PION */

function Pion(color, joueur) {
	this.etat = 2;
	this.position = 0;
	this.joueur = joueur;
	this.stats = {
		tour: 0,
		prison: 0
	}; // stat du joueur		
	this.pion = DrawerFactory.getPionJoueur(color,largeurPion);
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
		var pos = this.position + des;
		var axe = this.etat;
		while(pos<0){
			pos+=10;
			axe= (axe + 3)%4;
		}
		while (pos >= 10) {
			pos -= 10;
			axe = (axe + 1) % 4;
		}
		return {
			pos: pos,
			axe: axe
		}
	}

	this.goto = function (etat, pos, call) {
		var id = etat+"-"+pos;
		if(stats.positions[id] == null){
			stats.positions[id] = 1;
		}
		else{
			stats.positions[id]++;
		}
		$.trigger("monopoly.debug", {
			message: GestionJoueur.getJoueurCourant().nom + " est en " + this.etat + "-" + this.position + " et va en " + id
		});
		// On gere le cas de la case depart (si elle est sur le trajet)
		var depart = this.etat*10 + this.position;
		var cible = etat*10 + pos;
		if((depart < 20 && cible > 20) || (depart > cible && (depart < 20 || cible > 20))){
			this.treatCaseDepart();
		}
		this.etat = etat;
		this.position = pos;
		this.pion.goto(etat, pos, call,true);
	}

	// Si on passe par la case depart, on prend 20000 Francs
	this.treatCaseDepart = function () {
		this.stats.tour++;
		this.joueur.gagner(plateau.montantDepart || 20000);
	}    

	this.goDirectToCell = function (etat, pos, callback) {
		this.etat = etat;
		this.position = pos;
		this.pion.gotoDirect(etat,pos,callback);           
	}
}