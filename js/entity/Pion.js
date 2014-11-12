/* Objet PION */

function Pion(color, joueur,img) {
	this.axe = 2;
	this.position = 0;
	this.joueur = joueur;
	this.stats = {
		tour: 0,
		prison: 0,
		positions:[]
	}; // stat du joueur		
	this.pion = DrawerFactory.getPionJoueur(color,DrawerFactory.dimensions.largeurPion,img);
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
		var axe = this.axe;
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

	this.goto = function (axe, pos, call) {
		var id = axe+"-"+pos;

		if(this.stats.positions[id] == null){
			this.stats.positions[id] = 1;
		}
		else{
			this.stats.positions[id]++;
		}
		$.trigger("monopoly.debug", {
			message: GestionJoueur.getJoueurCourant().nom + " est en " + this.axe + "-" + this.position + " et va en " + id
		});
		// On gere le cas de la case depart (si elle est sur le trajet)
		var depart = this.axe*10 + this.position;
		var cible = axe*10 + pos;
		if((depart < 20 && cible > 20) || (depart > cible && (depart < 20 || cible > 20))){
			this.treatCaseDepart();
		}
		this.axe = axe;
		this.position = pos;
		this.pion.goto(axe, pos, call,true);
	}

	// Si on passe par la case depart, on prend 20000 Francs
	this.treatCaseDepart = function () {
		this.stats.tour++;
		this.joueur.gagner(InitMonopoly.plateau.infos.montantDepart || 20000);
	}    

	this.goDirectToCell = function (axe, pos, callback) {
		this.axe = axe;
		this.position = pos;
		this.pion.gotoDirect(axe,pos,callback);
	}
}