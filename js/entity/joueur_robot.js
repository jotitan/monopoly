import {Joueur,PlayerSaver,Notifier} from "./joueur.js";
import {GestionStrategie} from "./strategie.js";
import {GestionComportement} from "./comportement.js";
import {ETAT_LIBRE, GestionFiche} from "../display/case_jeu.js";
import {GestionDes} from "./dices.js";
import {GestionEchange, GestionEnchere} from "../enchere.js";
import {GestionJoueur} from "../gestion_joueurs.js";
import {VARIANTES, IA_TIMEOUT,globalStats} from "../monopoly.js";

/* Joueurs du jeu, version robot et manuel */
/* Objet central sur la gestion du jeu */

/* Joueur ordinateur */
/* Il faut, a la creation, definir le style de jeu : prudent (achat des deux premiere lignes), agressif (achete tout)
	mode fric (achete les plus chers).*/

const terrainNonListe = "TERRAIN_NON_LISTE";
const terrainDispo = "TERRAIN_DISPO";
const argentInsuffisant = "ARGENT_INSUFFISANT";

class PlayerOrdinateurSaver extends PlayerSaver{
	constructor(joueur){
		super(joueur);
	}
	saveMore(data) {
		data.comportement = this.joueur.comportement.id;
		data.strategie = this.joueur.strategie.id;
		// Charge l'historique des propositions (derniere proposition du terrain)
		data.rejectedPropositions = [];
		for (let id in this.joueur.rejectedPropositions) {
			let proposition = this.joueur.rejectedPropositions[id][this.joueur.rejectedPropositions[id].length -1].proposition;
			let terrains = [];	// On ne garde que les ids des fiches pour eviter les cycles a la sauvegarde
			proposition.terrains.forEach(terrain=>terrains.push(terrain.id));
			data.rejectedPropositions.push({
				id: id,
				proposition: {
					compensation:proposition.compensation,
					terrains:terrains
				}
			});
		}
	}

	loadMore(data) {
		this.joueur.init(data.strategie, data.comportement);
		this.joueur.rejectedPropositions = [];
		if (data.rejectedPropositions != null) {
			for (let id in data.rejectedPropositions) {
				let p = data.rejectedPropositions[id].proposition;
				let terrains = [];
				if(p.terrains!=null){
					for(let t in p.terrains){
						terrains.push(GestionFiche.getById(p.terrains[t]));
					}
				}
				// On ajoute la proposition dans le tableau
				this.joueur.rejectedPropositions[data.rejectedPropositions[id].id] = [{
					proposition:{
						compensation:p.compensation,
						terrains:terrains
					}
				}];
			}
		}
	}
}

class JoueurOrdinateur extends Joueur {
	constructor(numero, nom, color, argent,montantDepart){
		super(numero, nom, color,argent,montantDepart);
		this.type = "Ordinateur";
		// Threashold when detecting dangerous case
		this.threasholdMontant = argent*0.65;
		this.canPlay = false;
		/* Strategie : definit le comportement pour l'achat des maisons */
		this.strategie = null;
		/* Comportement : definit le rapport e l'argent. Inclu la prise de risque */
		this.comportement = null;
		this.nom = nom;
		this.rejectedPropositions = []; // Sotcke les propositions rejetees
		this.saver = new PlayerOrdinateurSaver(this);
		this.init();
	}

	/* Determine les caracteristiques d'un ordinateur*/
	init(idStrategie, idComportement) {
		this.strategie = (idStrategie === undefined) ? GestionStrategie.createRandom() : GestionStrategie.create(idStrategie);
		this.comportement = (idComportement === undefined) ? GestionComportement.createRandom() : GestionComportement.create(idComportement);
	}

	// Fonction appelee lorsque le joueur a la main
	joue () {
		// On reevalue a intervalle regulier la strategie
		this.changeStrategie();
		// On fait des demandes d'echange de proprietes. Asynchrone, le reste du traitement est  en callback
		this.echangeProprietes(()=> {
			// Construit des maisons / hotels
			this.buildConstructions();
			// rachete les hypotheques
			this.rebuyHypotheque();
			// on lance les des
			$.trigger('monopoly.debug',{message:`joueur ${this.nom} joue`});
			GestionDes.lancer();
		});
	}

	/* Choisi la case qui l'interesse le plus */
	/* 1) Cherche dans les terrains libres celui qu'il prefere */
	/* 2) Si pas de terrain libre, choisi la case prison (protege le plus) si besoin */
	choisiCase(callback){
		let fiches = GestionFiche.getFreeFiches();
		let maxInteret;
		let maxFiche = null;
		fiches.forEach(function(fiche){
			let interet = this.strategie.interetGlobal(fiche,this,false).interet;
			if(interet !==0 && (maxInteret === undefined || interet > maxInteret)){
				maxInteret = interet;
				maxFiche = fiche;
			}
		},this);
		if(maxFiche!=null){
			callback(maxFiche);
		}else{
			// Interessant de rester en prison
			if(!this.getOutPrison()){
				callback(GestionFiche.getPrison());
			}else{
				callback(GestionFiche.getDepart());
			}
		}
	}

	/* Pour le de rapide, choisi la meilleure configuration */
	/* 1) Prefere les terrains libres qui l'interessent */
	/* 2) Prefere les terrains libres */
	/* 3) Choisi les cases safe (case depart, parking, simple visite) */
	/* 4) Choisi le loyer le moins cher a payer */
	choisiDes(des1,des2,callback){
		let f1 = {fiche:this.pion.deplaceValeursDes(des1),total:des1};
		let f2 = {fiche:this.pion.deplaceValeursDes(des2),total:des2};
		let f3 = {fiche:this.pion.deplaceValeursDes(des1 + des2),total:des1+des2};

		let maxInteret = -1000;
		let total = 0;
		[f1,f2,f3].forEach(f=>{
			let value = this._analyseCase(GestionFiche.get(f.fiche));
			if(value > maxInteret){
				total = f.total;
				maxInteret = value;
			}
		});
		callback(total);
	}

	/* Determine l'interet d'une case. Plus il est elevé, plus il est important */
	/* Interet pour taxe depend du montant. */
	/* Case depart mieux que terrain inutile mais moins que terrain utile */
	/* Prison depend de l'interet a y rester. Si non, equivaut a une taxe de 2000 */
	/* Interet d'un terrain depend des moyens qu'on a */
	/* TODO : dans le cas d'enchere immediate, empecher de tomber sur un terrain qui interesse un autre ? */
	_analyseCase(fiche){
		let interet = 0;
		if(fiche.isPropriete() === true){
			interet = fiche.statut === ETAT_LIBRE ?
				this.strategie.interetGlobal(fiche,this,false).interet :
				fiche.getLoyerFor(this) / -1000;
		}
		switch(fiche.type){
			case "prison" : interet = this.getOutPrison() ? -2 : 1;break;
			case "taxe" : interet = -1 * fiche.montant / 1000;break;
			case "depart": interet = 0.5;break;
		}
		return interet;
	}

	// Fonction appelee lorsque les des sont lances et que le pion est place
	actionApresDes(buttons, propriete) {
		if (buttons === undefined || buttons == null) {
			return;
		}
		let _self = this;
		setTimeout(function () {
			if (buttons.Acheter != null && propriete != null) {
				let interet = _self.strategie.interetGlobal(propriete).interet;
				let comportement = _self.comportement.getRisqueTotal(_self, propriete.achat);
				$.trigger("monopoly.debug", {
					message: "Strategie : " + interet + " " + comportement
				});
				if (interet > comportement) {
					$.trigger("monopoly.debug", {
						message: "IA Achete"
					});
					buttons.Acheter();
					return;
				}
			}
			for (let i in buttons) {
				if (i !== "Acheter") {
					buttons[i]();
					return;
				}
			}
		}, IA_TIMEOUT);
	}

	notifyAcceptProposition(callback) {
		if (callback) {
			callback();
		}
	}

	notifyRejectProposition(callback, terrain, proposition) {
		// On enregistre le refus du proprietaire : le terrain, la proposition et le numero de tour
		// utiliser pour plus tard pour ne pas redemander immediatement
		if (this.rejectedPropositions[terrain.id] === undefined) {
			this.rejectedPropositions[terrain.id] = [];
		}
		this.rejectedPropositions[terrain.id].push({
			nbTours: globalStats.nbTours,
			proposition: proposition
		});
		callback();
	}

	addIsolateHouse(maison,proposition){
		let data = this.maisons.findUnterestsProprietes();
		let montant = 0;
		if (data.proprietes.length > 0) {
			let proprietes = data.proprietes;
			// On en ajoute. En fonction de la strategie, on n'ajoute que les terrains seuls dans le groupe (peu important)
			for (let i = 0; i < proprietes.length && montant / maison.achat < 0.7; i++) {
				let terrain = proprietes[i];
				// Il ne faut pas proposer un terrain du meme groupe que le terrain demande car pas forcement de la strategie
				// Deux terrains qui ne sont pas de la strategie sont potentiellement interessant a garder
				if (!this.strategie.interetPropriete(terrain) && (terrain.groupe == null || !terrain.groupe.equals(maison.groupe))) {
					// On le refourgue
					proposition.deals.push(terrain);
					montant += terrain.achat;
				}
			}
		}
		return montant;
	}

	/* Cherche a echanger des proprietes. Methode bloquante car negociation avec d'autres joueurs
	 * Se deroule en plusieurs etapes :
	 * Calcule les terrains qui l'interessent chez les adversaires
	 * Penser a prendre les affinites en compte
	 * @param callback : traitement a lancer a la fin des echanges
	 * Il faut retenir les demandes rejetees pour proposer plus et ne pas demander a chaque tour
	 */
	echangeProprietes(callback=()=>{}) {
		// Quand echange uniquement apres la vente de tous les terrains
		if(VARIANTES.echangeApresVente && GestionFiche.isFreeFiches()){
			return callback();
		}
		// Proprietes qui interessent le joueur
		let proprietes = this.maisons.findOthersInterestProprietes();
		if (proprietes.length === 0) {
			return callback();
		}
		const nbGroupesPossedes = this.maisons.findConstructiblesGroupes().length;
		/* On calcule l'importance d'echanger (si des groupes sont presents ou non) */
		const interetEchange = Math.pow(1 / (1 + nbGroupesPossedes), 2);

		/* On cherche les monnaies d'echanges. */
		let proprietesFiltrees = [];
		for (let p in proprietes) {
			let prop = proprietes[p];
			let maison = prop.maison;
			// On verifie si une demande n'a pas ete faite trop recemment
			if (this._canAskTerrain(maison)) {
				let last = this._getLastProposition(maison);
				let joueur = maison.joueurPossede;
				prop.compensation = 0;
				// Calcule les monnaies d'echange
				prop.deals = maison.joueurPossede.maisons.findOthersInterestProprietes(this,maison);
				if (prop.deals.length === 0) {
					// On ajoute les terrains non importants (gare seule, compagnie)
					let localMontant = this.addIsolateHouse(maison,prop);

					// Permettre calcul compensation quand traitement fournit des terrains < 80% du montant
					if (localMontant / maison.achat < 0.8) {
						prop.compensation = this.evalueCompensation(joueur, maison, interetEchange, last) - localMontant;
					}
				} else {
					// Si trop couteux, on propose autre chose, comme de l'argent. On evalue le risque a echanger contre ce joueur.
					// On teste toutes les monnaies d'echanges
					const monnaies = this.chooseMonnaiesEchange(prop, prop.monnaiesEchange, true, nbGroupesPossedes >= 2, last);
					if (monnaies === undefined || monnaies.length === 0) {
						prop.compensation = this.evalueCompensation(joueur, maison, interetEchange, last);
						prop.deals = null;
					} else {
						prop.deals = monnaies;
					}
				}
				// Si aucune proposition, on ajoute les autres terrains dont on se moque (terrains constructibles mais non intéressant)
				// Potentiellement un terrain de la strategie peut tout de meme etre proposee (une gare par exemple)
				if ((prop.deals == null || prop.deals.length === 0) && prop.compensation === 0) {
					const terrains = this.maisons.findOthersProperties(proprietes);
					let montant = 0;
					for (var i = 0; i < terrains.length && montant / maison.achat < 0.7; i++) {
						const terrain = terrains[i];
						if (!this.strategie.interetPropriete(terrain)) {
							if (prop.deals == null) {
								prop.deals = [];
							}
							// On le propose
							prop.deals.push(terrain);
							montant += terrain.achat;
						}
					}
				}
				if ((prop.deals != null && prop.deals.length > 0) || (prop.compensation != null && prop.compensation > 0)) {
					proprietesFiltrees.push(prop);
				}
			} else {
				$.trigger('monopoly.debug', {
					message: 'Le joueur ne demande pas ' + maison.nom
				});
			}
		}
		this.doPropositionToPlayer(proprietesFiltrees,callback);
	}
	doPropositionToPlayer(proprietes,callback){
		if (proprietes.length !== 0) {
			for (let idx in proprietes) {
				let p = proprietes[idx];
				let proposition = {
					terrains: (p.deals == null) ? [] : p.deals,
					compensation: p.compensation
				};
				try {
					// L'action de fin d'un ordinateur
					GestionEchange.init(this, p.maison.joueurPossede, p.maison, callback);
					GestionEchange.propose(proposition);
					return;
				} catch (e) {
					console.log(e);
					// Deja en cours quelque part, on continue
					return callback();
				}
			}
		}else{
			// Aucun echange n'est fait, on continue
			return callback();
		}
	}

	/* Verifie que le terrain peut etre demande a l'echange (si une precedente demande n'a pas été faite trop recemment) */
	_canAskTerrain(terrain) {
		// On prend le dernier
		const last = this._getLastProposition(terrain);
		if (last != null) {
			const pas = 3 + (Math.round((Math.random() * 1000) % 3));
			return last.nbTours + pas < globalStats.nbTours;
		}

		return true;
	}

	/* Renvoie la derniere proposition faite pour un terrain */
	_getLastProposition(terrain) {
		if (this.rejectedPropositions != null && this.rejectedPropositions[terrain.id] != null) {
			return this.rejectedPropositions[terrain.id][this.rejectedPropositions[terrain.id].length - 1];
		}
		return null;
	}

	// La gestion des echanges se passe par des mecanismes asynchrones. On utilise un objet contenant une proposition / contre proposition et un statut.
	// On bloque le traitement d'un joueur

	/* Suite a une demande d'echange d'un joueur, analyse la requete. Plusieurs cas :
	 * Accepte la proposition (ACCEPT, indice > 3)
	 * Refuse la proposition (BLOCK, indice < 0)
	 * Fait une contre proposition en demandant plus d'argent et / ou d'autres terrains (UP, 1 < indice > 5)
	 * Principe de l'algo : evalue les criteres pour obtenir un indicateur qui permet de repondre (bornes)
	 * Gerer le cas de 2 ou il nous demande le terrain que l'on a (et qui nous interesse)
	 */
	traiteRequeteEchange(joueur, maison, proposition) {
		// Si aucune compensation, on refuse
		if ((proposition.terrains === undefined || proposition.terrains.length === 0) && (proposition.compensation === undefined || proposition.compensation === 0)) {
			return GestionEchange.reject(this);
		}
		let others = this.maisons.findOthersInterestProprietes(joueur);
		let infos = this._calculatePropositionValue(maison, joueur, proposition, others);
		if (infos.critere >= 3) {
			return GestionEchange.accept(this);
		}
		if (infos.critere <= 0) {
			return GestionEchange.reject(this);
		}

		let contreProposition = {
			terrains: [],
			compensation: 0
		};
		let turn = 0; // Pas plus de 3 tour de calcul
		do {
			contreProposition = this._calculateContreProposition(joueur, proposition, contreProposition, infos.recommandations, maison, others);
			infos = this._calculatePropositionValue(maison, joueur, contreProposition, others);
		} while (infos.critere < 3 && turn++ < 3);

		if (infos.critere < 3) { // Impossible a generer
			return GestionEchange.reject(this);
		}
		return GestionEchange.contrePropose(contreProposition, this);
	}

	_calculateContreProposition(joueur, proposition, contreProposition, recommandations, terrain, others) {
		if (recommandations[terrainDispo] === 1 || recommandations[terrainNonListe] === 1) {
			// terrain dispo non propose, on ajoute tant que la valeur du terrain n'est pas atteinte
			let montant = 0;
			for (let i = 0; i < others.length; i++) {
				if (!others[i].maison.groupe.equals(terrain.groupe)) { // si on est interesse par le meme groupe
					contreProposition.terrains.push(others[i].maison);
					montant += others[i].maison.achat;
					if (montant > terrain.achat) {
						break;
					}
				}
			}
			/* Ajout d'un terrain de la propal originale */
			if (montant < terrain.achat && recommandations[terrainNonListe] === 1) {
				// On ajoute un terrain propose avant
				let done = false;
				for (let i = 0; i < proposition.length && !done; i++) {
					if (!contreProposition.terrains.contains(proposition.terrains[i])) {
						contreProposition.terrains.push(proposition.terrains[i]);
						done = true;
					}
					if (!done) {
						// Il faut proposer autre chose, autre terrain
						let uselessProprietes = joueur.maisons.findUnterestsProprietes();
						if (uselessProprietes.proprietes.length > 0) {
							contreProposition.terrains.push(uselessProprietes.proprietes[0]);
						}
					}
				}
			}
		}
		if (recommandations[argentInsuffisant] === 1) {
			contreProposition.compensation += terrain.achat / 2;
		}
		return contreProposition;
	}

	/* Calcule la valeur d'une proposition d'echange */
	/* @return : renvoie la valeur de la proposition ainsi que des recommandations (utilise pour les contre propositions) */
	_calculatePropositionValue(maison, joueur, proposition, others) {
		let recommandations = []; // Enregistre des parametres pour la contre proposition

		// Indique qu'on est aussi interesse par ce groupe
		let interesetMeToo = others.some(o=>maison.groupe.equals(o.maison.groupe));

		let critereTerrains = 0;
		let critereArgent = 0;
		// Gestion des terrains
		if ((proposition.terrains != null && proposition.terrains.length > 0)) {
			let useList = false;
			for (let t in proposition.terrains) {
				let terrain = proposition.terrains[t];
				// On verifie si dans others et on note l'ordre dans la liste, signe de l'interet
				let interetTerrain = null;
				for (let i = 0; i < others.length; i++) {
					if (others[i].maison.equals(terrain)) {
						interetTerrain = i;
					}
				}
				// Si le terrain est dans la liste, on augmente le critere et prend en compte la position en plus value
				if (interetTerrain != null) {
					critereTerrains += 1 + (others.length - interetTerrain) / others.length;
					useList = true;
				}
				// On ajoute une info sur le prix du terrain propose, constitue une valeur ajoutee
				critereTerrains += terrain.achat / maison.achat;
			}
			if (!useList) {
				recommandations[terrainNonListe] = 1;
			}
		} else {
			if (others != null && others.length > 0) {
				// On verifie si le terrain demande n'appartient pas un groupe qui nous interesse
				let length = others.length - ((interesetMeToo) ? 1 : 0);
				critereTerrains -= length;
				recommandations[terrainDispo] = 1; // Indique qu'un terrain peut etre choisi en contre proposition
			}
		}
		// Gestion de la compensation
		if (proposition.compensation != null) {
			critereArgent = proposition.compensation / maison.achat;
			/* On ajoute de l'importance si proposition superieur au fond propre */
			if (this.montant < proposition.compensation) {
				critereArgent += Math.min(1.5, (proposition.compensation / this.montant) - 1);
			} else {
				recommandations[argentInsuffisant] = 1;
			}
		} else {
			recommandations["NO_ARGENT"] = 1;
		}

		/* Confirme le traitement ou le durci. Prend le pas sur la decision calculee  */
		let strategie = this.strategie.acceptSwapTerrain(maison, joueur, others, interesetMeToo);

		// On melange le tout
		let critere = (critereTerrains + critereArgent) * strategie;
		$.trigger('monopoly.debug',{message:"Criteres : " + critere + " " + critereTerrains + " " + critereArgent});
		return {
			critere: critere,
			recommandations: recommandations,
			others: others
		};

	}

	/* Traite la contre proposition qui peut se composer de terrain et / ou d'argent */
	/* A la fin, on a accepte ou pas. Plus d'aller retour. */
	/* Prendre en compte qu'on est a l'origine de la demande, un peu plus laxiste, en fonction du comportement */
	traiteContreProposition(proposition, joueur, maison) {
		if (proposition.terrains.length === 0 && proposition.compensation === 0) {
			return GestionEchange.reject(this);
		}
		/* On evalue la pertinence  */
		let others = this.maisons.findOthersInterestProprietes(joueur);
		let infos;
		if (proposition.terrains.length > 0) {
			// On inverse les parametres
			let prop = {
				terrains: [maison],
				compensation: proposition.compensation * -1
			};
			let terrain = proposition.terrains[0];
			infos = this._calculatePropositionValue(terrain, joueur, prop, others);
		} else {
			// Uniquement de la tune
			// Il demande de l'argent, on verifie par rapport a nos resources
			infos = {
				critere: 2
			};
		}
		// On peut etre un peu plus laxiste ?
		if (infos.critere > 3) {
			return GestionEchange.accept(this);
		}
		return GestionEchange.reject(this);
	}

	/* Si aucune monnaie d'echange ou si la monnaie d'echange est trop dangereuse, on evalue une compensation financiere
	 * Plusieurs criteres sont pris en compte :
	 * 1) Prix de base du terrain.
	 * 2) Economie propre, il faut pouvoir acheter des maisons derriere (2 sur chaque terrain)
	 * Renvoie des bornes min / max. On propose le min au debut
	 * @param oldPropal : si non nulle, il existe une precedente proposition et on propose une compensation plus importante
	 */
	evalueCompensation (joueur, maison, interetTerrain, oldProposition) {
		// On calcule les sommes dispos. En fonction de l'interet pour le terrain, on peut potentiellement hypothequer
		let budgetMax = this.comportement.getBudget(this, (interetTerrain != null && interetTerrain > 2));
		let budget = Math.min(budgetMax, maison.achat);
		if (oldProposition != null && oldProposition.proposition.compensation >= budget) {
			budget = Math.min(this.montant, oldProposition.proposition.compensation * this.comportement.getFactorForProposition());
			// On plafonne le budget (fonction logarithmique)
			let plafondBudget = (14 - Math.log(maison.achat)) * maison.achat;
			budget = Math.min(budget, plafondBudget);
		}
		return Math.round(Math.max(0, budget));
	}

	/* Evalue la dangerosite d'un joueur s'il recupere une maison supplementaire pour finir un groupe */
	/* Plusieurs criteres :
	 * 1) Capacite a acheter des constructions
	 * 2) Rentabilite du groupe (hors frais d'achat, uniquement maison + loyer)
	 * 3) Creation d'une ligne
	 * Renvoie un nombre. Au dessus de 1, dangereux, en dessous, pas trop.
	 */
	isDangerous (groupe) {
		// Critere 1, nombre de maison par terrain pouvant etre achete
		let nbMaison = (this.argent / groupe.maisons[0].prixMaison) / groupe.fiches.length;
		// compte les autres groupes
		let criterePrix = (groupe.maisons[0].loyers[nbMaison]) / this.threasholdMontant;
		// Ligne presente
		let groups = this.maisons.findConstructiblesGroupes();
		let isLigne = false;
		for (let g in groups) {
			if (groups[g].isVoisin(groupe)) {
				isLigne = true;
			}
		}
		// Resultat : nb maison, le fait de faire une ligne et une ponderation par le prix
		let moteur = (nbMaison + criterePrix) * (isLigne ? 2 : 1);

		return moteur >= 5;
	}

	/* Choisis les terrains qu'il est possible de ceder en echange du terrain */
	/* Se base sur la dangerosite du terrain (n'est pas pris en compte) et sur la valeur des terrains par rapport a ce qui est demande */
	/* @param testDangerous : si le joueur est le seul fournisseur et qu'on a pas le choix, on prend le terrain*/
	/* @param strict : si strict est vrai, on ne relance pas l'algo en etant moins dangereux. Le joueur decide de ne pas faire de cadeau */
	/* @param oldProposition : derniere proposition refusee qui a ete faite, plus laxiste dans ce cas */
	chooseMonnaiesEchange (terrainVise, terrains, testDangerous, strict, oldProposition) {
		if (terrains === undefined || terrains.length === 0) {
			return [];
		}
		let proposition = [];
		let valeur = 0;
		// Si seul fournisseur, il faut etre plus laxiste.
		for (let t in terrains) {
			if (!terrainVise.joueurPossede.isDangerous(terrains[t].groupe) || !testDangerous) {
				// On regarde si c'est necessaire de l'ajouter
				if (valeur === 0) {
					proposition.push(terrains[t]);
					valeur += terrains[t].achat;
				} else {
					let rapport = (Math.abs(1 - terrainVise.achat / valeur)) / (Math.abs(1 - terrainVise.achat(valeur + terrains[t].achat)));
					if (rapport > 1) {
						proposition.push(terrains[t]);
						valeur += terrains[t].achat;
					}
				}
			}
		}
		if (proposition.length === 0 && !strict && (testDangerous || oldProposition != null)) {
			// On relance sans etre strict
			return this.chooseMonnaiesEchange(terrainVise, terrains, joueur, false, strict);
		}
		return proposition;
	}

	initEnchere(transaction, terrain) {
		if (this.equals(terrain.joueurPossede)) {
			return;
		}
		// On calcule le budget max que le joueur peut depenser pour ce terrain
		if (this.currentEchange != null) {
			throw "Impossible de gerer une nouvelle enchere";
		}
		let interet = this.strategie.interetGlobal(terrain, this, true);
		let budgetMax = this.comportement.getMaxBudgetForStrategie(this, interet.interet);
		this.currentEnchere = {
			transaction: transaction,
			terrain: terrain,
			budgetMax: budgetMax,
			joueurInteresse:interet.joueur
		}
	}

	updateInfoEnchere(montant, lastEncherisseur) {}

	updateEnchere(transaction, jeton, montant, lastEncherisseur) {
		if (transaction !== this.currentEnchere.transaction) {
			return;
		}
		// Le joueur a l'enchere courante la plus haute
		if (this.equals(lastEncherisseur)) {
			return;
		}
		// On temporise la reponse de IA_TIMEOUT + random de ms
		let timeout = IA_TIMEOUT * (Math.random() + 1);
		setTimeout(() =>{
			if(this.currentEnchere === undefined){return;}
			if (montant > this.currentEnchere.budgetMax ||
				(this.currentEnchere.joueurInteresse!=null && !this.currentEnchere.joueurInteresse.equals(lastEncherisseur))) {
				// Exit enchere
				GestionEnchere.exitEnchere(this);
			} else {
				// Fait une enchere. Dans le cas d'un blocage, joueurInteresse est renseigne. Enchere uniquement s'il est le dernier
				try {
					GestionEnchere.doEnchere(this, montant, jeton);
				} catch (e) {
					// Si une enchere a deja ete faite et update, on arrete la demande (joueur trop lent)
				}
			}
		},timeout);
	}

	notifyExitEnchere(joueurs) {}

	/* Comportement lorsque l'enchere est terminee */
	endEnchere() {
		this.currentEnchere = null;
		GestionEnchere.checkEndNotify(this);
	}

	/* Permet de faire du blocage de construction : vente d'un hotel pour limiter l'achat de maison, decision d'acheter un hotel pour bloquer.
	 * Se base sur les terrains constructibles des adversaires ainsi que de leur tresorerie.
	 * Retourne vrai s'il faut bloquer le jeu de constructions
	 */
	doBlocage() {
		// On compte le nombre joueurs qui peuvent construire
		GestionJoueur.forEach(function(joueur){
			if (!this.equals(this)) {
				let groups = joueur.maisons.findConstructiblesGroupes();
				if (groups.size() > 0) {
					// On verifie si le budget est important ()
					// On compte le potentiel de maison achetables
					let nbMaisons = 0;
					let coutMaisons = 0;
					for (let color in groups) {
						let group = groups[color];
						for (let index in group.proprietes) {
							let maison = group.proprietes[index];
							nbMaisons += 5 - maison.nbMaison;
							coutMaisons += (5 - maison.nbMaison) * maison.prixMaison;
						}
					}
					let budgetMin = (coutMaisons / nbMaisons) * 3;
					if (nbMaisons > 3 && budgetMin < joueur.montant) {
						// On doit bloquer la construction
						return true;
					}
				}
			}
		},this);
		return false;
	}

	_buildSortScore(maison){
		switch (maison.type) {
			case "gare":
				return -1;
			case "compagnie":
				return -2;
			default:
				return (maison.isTerrain()) ? maison.groupe.getInfos(this).joueur : 0;
		}
	}

	propertiesSortByDescImportance(){
		return this.maisons.maisons
			.filter(m=>m.statutHypotheque === false && !m.isGroupeeAndBuild())
			.sort((a, b) =>this._buildSortScore(a) - this._buildSortScore(b));
	}

	/* Override de la methode pere */
	/* Ordre de liquidations :
		 * 1) Terrains non constructibles, terrains non groupes, terrains groupes non construits
		 * 2) Vente des maisons les maisons / hotels les mains rentables prochainement (base sur les stats des prochains passages)
		 * 3) Hypotheque des terrains precedemment construits
		 **/
	resolveProblemeArgent(montant, callback) {
		$.trigger('monopoly.debug', {
			message: 'Resoud probleme argent'
		});
		/* CAS 1 */
		let maisons = this.propertiesSortByDescImportance();

		$.trigger("monopoly.debug", {
			message: "PHASE 1"
		});
		for (let index = 0; index < maisons.length && this.montant < montant; index++) {
			maisons[index].hypotheque();
		}

		/* CAS 2 */
		if (this.montant < montant) {
			$.trigger("monopoly.debug", {
				message: "PHASE 2"
			});
			// 3 Terrains construits, on vend les maisons dessus
			// On recupere les groupes construits classes par ordre inverse d'importance. On applique la meme regle que la construction tant que les sommes ne sont pas recupereres
			let sortedGroups = this.getGroupsToConstruct("ASC", 0.1);
			// On boucle (tant que les sommes ne sont pas recouvres) sur le groupe pour reduire le nombre de maison, on tourne sur les maisons
			for (let idGroup in sortedGroups) {
				let group = sortedGroups[idGroup];
				// On boucle pour reduire les maisons au fur et a mesure
				let proprietes = group.proprietes;
				// On trie par nombre de maison
				proprietes.sort((a, b) =>
					a.nbMaison === b.nbMaison ? 0 :
						(a.nbMaison < b.nbMaison) ? 1 : -1
				);
				let currentId = 0;
				let nbNoHouse = 0;
				let boucle = 0; // Securite pour eviter boucle infinie
				let maisonVendues = 0;
				while (this.montant < montant && nbNoHouse < proprietes.length && boucle++ < 100) {
					let p = proprietes[currentId];
					if (p.nbMaison === 0) {
						nbNoHouse++;
					} else {
						if (p.sellMaison(this)) {
							maisonVendues++;
							this.gagner(p.prixMaison / 2, true);
						}
					}
					currentId = (currentId + 1) % proprietes.length;
				}
				if (this.montant > montant) {
					if (maisonVendues > 0) {
						$.trigger('monopoly.vendMaison', {
							joueur: this,
							nbMaison: maisonVendues
						});
					}
					$.trigger('refreshPlateau');
					break;
				}
			}
		}
		/* CAS 3, il reste les maisons groupees desormais non construites */
		if (this.montant < montant) {
			let localsMaisons = this.maisons.maisons.filter(m=>m.statutHypotheque === false);
			// On trie par montant (moins cher en premier). A deporter dans la strategie
			localsMaisons.sort((a, b) =>a.achat - b.achat);
			for (let index = 0; index < localsMaisons.length && this.montant < montant; index++) {
				localsMaisons[index].hypotheque();
			}
		}
		// Somme recouvree
		this.setArgent(this.montant - montant); // Paiement de la dette
		this.bloque = false;
		callback();
		return true;
	}

	getNbGroupConstructibles() {
		return this.maisons.maisons
			.filter(m=>m.isGroupee())
			.reduce((s,m)=>{s.add(m.groupe.nom);return s},new Set())
			.size;
	}

	/* Renvoie la liste des groupes a construire trie.
	 * @param sortType : Tri des groupes en fonction de l'importance. ASC ou DESC
	 */
	getGroupsToConstruct(sortType, level) {
		let groups = this.maisons.findConstructiblesGroupes(); // structure : [color:{color,proprietes:[]}]
		// Pas de terrains constructibles
		if (groups.size() === 0) {
			return [];
		}
		// On determine les terrains les plus rentables a court terme (selon la position des joueurs)
		let maisons = this.comportement.getNextProprietesVisitees(this, level);
		// On Calcule pour chaque maison des groupes (meme ceux sans interet) plusieurs indicateurs : proba (pondere a 3), la rentabilite (pondere a 1)
		let totalMaisons = 0; // Nombre total de proprietes constructibles
		for (let color in groups) {
			let group = groups[color];
			group.proba = 0;
			group.rentabilite = 0;
			group.lessThree = 0;
			group.interetGlobal = 0;
			for (let index in group.proprietes) {
				let propriete = group.proprietes[index];
				totalMaisons++;
				// On cherche si proba
				if (maisons[propriete.id] != null) {
					group.proba += maisons[propriete.id].proba * 3;
				}
				group.rentabilite += propriete.getRentabilite();
				group.lessThree += (propriete.nbMaison <= 3) ? 0.5 : 0;
			}
		}
		// On trie les groupes
		let sortedGroups = [];
		for (let color in groups) {
			let group = groups[color];
			group.interetGlobal = group.proba + group.rentabilite + ((group.lessThree > 0) ? 0.5 : 0);
			sortedGroups.push(group);
		}
		let GREATER_VALUE = (sortType === "ASC") ? 1 : -1;
		let LESSER_VALUE = (sortType === "ASC") ? -1 : 1;

		sortedGroups.sort((a, b)=>a.interetGlobal === b.interetGlobal ? 0 :
			a.interetGlobal > b.interetGlobal ? GREATER_VALUE : LESSER_VALUE);
		return sortedGroups;
	}

	/* Renvoie les groupes construits */
	/* @param nbMaison : nombre de maison moyen qui servent de palier */
	hasConstructedGroups (nbMaison=0) {
		let groups = this.maisons.findConstructiblesGroupes();
		for (let idGroup in groups) {
			if (groups[idGroup].group.getAverageConstructions() > nbMaison) {
				return true;
			}
		}
		return false;
	}

	/* Rachete les hypotheques */
	/* Cas : groupes presents (1) et construits (nb>3). Liquidite > 7 fois prix hypotheque */
	rebuyHypotheque () {
		// Hypotheque presentes
		let terrains = this.maisons.findMaisonsHypothequees();
		if (terrains === undefined || terrains.length === 0 && (this.getNbGroupConstructibles() > 0 && !this.hasConstructedGroups(3))) {
			return;
		}
		let pos = 0;
		while (pos < terrains.length && this.montant > 7 * terrains[pos].achatHypotheque) {
			terrains[pos++].leveHypotheque();
		}
	}

	// Return the minimum price to build an house
	minimumPriceHouse(){
		return this.maisons.maisons.length === 0 ? 0 : this.maisons.maisons.reduce((a,b)=>a.prixMaison < b.prixMaison ? a:b,Number.MAX_SAFE_INTEGER).prixMaison;
	}

	/* Construit des maisons / hotels
	 * Calcul les groupes constructibles, verifie l'argent disponible. Construit sur les proprietes ou peuvent tomber les adversaires (base sur leur position et les stats au des)
	 * Possibilite d'enregistrer tous les deplacements des joueurs pour affiner les cases les plus visitees
	 */
	buildConstructions() {
		if(this.maisons.maisons.length === 0){return;}
		let budget = this.comportement.getBudget(this);
		// Pas d'argent
		if (budget < this.minimumPriceHouse()) {
			return;
		}
		let sortedGroups = this.getGroupsToConstruct("DESC", 0.1);
		if(sortedGroups.length === 0) {
			// Pas de terrains constructibles
			return;
		}
		// On tri les maisons de chaque groupe en fonction du prix et du nombre (le moins de maison en premier puis l'achat le plus eleve
		for (let idGroup in sortedGroups) {
			sortedGroups[idGroup].proprietes.sort(function (a, b) {
				if (a.nbMaison === b.nbMaison) {
					if (a.achat === b.achat) {
						return 0;
					}
					return a.achat < b.achat ? 1 : -1
				}
				return a.nbMaison > b.nbMaison ? 1 : -1;
			});
		}


		/* Plusieurs regles pour gerer les constructions :
         * Si un seul groupe, on construit notre budget dessus
         * Si plusieurs groupes avec des taux equivalent, on construit sur le groupe le plus rentable (basé sur stats et sur cout)
         * On construit jusqu'a obtenir 3 maisons partout (seuil de rentabilité). On construit ensuite sur l'autre groupe
         * On construit toujours plus sur la maison la plus chere
         * S'il reste du budget, on recupere les terrains sans interet et on construit dessus
         * On calcule la somme des taux par groupe
         */


		// On construit des maisons. On s'arrete quand plus de budget ou qu'on ne peut plus construire (hotel partout ou 4 maisons (blocage de constructions))
		let stopConstruct = false;
		let currentMaison = 0;
		let currentGroup = 0;
		let seuil = 3; // Premier passage, ensuite passe a 4 ou 5
		let achats = {
			maison: 0,
			hotel: 0,
			terrains:[]
		};
		while (budget >= 5000 && !stopConstruct) {
			// On choisit une maison
			let group = sortedGroups[currentGroup];
			// Changement de group
			let maison = group.proprietes[currentMaison];
			// Si le seuil est atteint, on construit sur une autre maison ou sur un autre group
			if (maison.nbMaison >= seuil) {
				if (group.treat === undefined) {
					group.treat = 1;
				} else {
					group.treat++;
				}
				// Le goupe est traite, on passe au suivant
				if (group.treat === group.proprietes.length) {
					currentGroup++;
					currentMaison = 0;
					// Soit on a fait le tour, on recommence en changeant le seuil
					if (currentGroup >= sortedGroups.length) {
						if (seuil === 3) {
							seuil = 5;
							for (let color in sortedGroups) {
								sortedGroups[color].treat = 0;
							}
							currentGroup = 0;
						} else {
							// Fin du traitement
							stopConstruct = true;
						}
					}
				} else {
					// Maison suivante dans le groupe
					currentMaison = (currentMaison + 1) % group.proprietes.length;
				}
			} else {
				// On construit
				try {
					maison.buyMaison(this, true);
					budget -= maison.prixMaison;
					this.payer(maison.prixMaison);
					if (maison.nbMaison === 4) { //hotel
						achats.hotel++;
					} else {
						achats.maison++;
					}
					achats.terrains[group.proprietes[currentMaison].id] = group.proprietes[currentMaison];
					currentMaison = (currentMaison + 1) % group.proprietes.length;
				} catch (e) {
					// Plus de maison ou d'hotel (on peut potentiellement continuer en achetant des maisons ?)
					stopConstruct = true;
				}

			}
		}
		$.trigger('monopoly.acheteConstructions', {
			joueur: this,
			achats: achats
		});
		$.trigger('refreshPlateau');
	}


	/* Reevalue la strategie. Se base sur plusieurs parametres :
     * Si peu de propriete ont ete achetees (<3)
     * Si 60% des terrains qui l'interessent ont ete vendu
     * Si aucune famille n'est completable (dans la strategie choisie)
     * Si on possede deux terrains d'une strategie qui n'est pas la notre, on choisi cette strategie
     * TODO : Si on a des groupes, que la strategie est bloquee et qu'on a de l'argent pour changer
     */
	changeStrategie() {
		let localStats = this.strategie.getStatsProprietes();
		if (localStats.color.pourcent < 40 && this.countInterestProperties() <= 2 && !this.isFamilyFree()) {
			$.trigger("monopoly.debug", {
				message: this.nom + " cherche une nouvelle strategie"
			});
			// On change de strategie. Une nouvelle strategie doit posseder au moins 60% de ses terrains de libre
			for (let i in GestionStrategie.getAll()) {
				let s = GestionStrategie.create(i);
				if (s.name !== this.strategie.name) {
					let strategieStats = s.getStatsProprietes();
					if (strategieStats.color.pourcent > 50) {
						// Nouvelle strategie
						$.trigger("monopoly.debug", {
							message: this.nom + " change de stratégie : " + this.strategie.name + " => " + s.name
						});
						this.strategie = s;
						return;
					}
				}
			}
			// On garde la meme si aucune n'est interessante
		}
	}

	/* Compte le nombre de maison possedee correspondant a la strategie */
	countInterestProperties() {
		return this.maisons.maisons.filter(m=>this.strategie.groups.contains(m.color)).length;
	}

	/* Indique s'il existe des familles que je peux encore posseder sans echange
     * Se base sur les maisons possedees et non celle de la strategie =>TODO
     */
	isFamilyFree() {
		// On parcourt les terrains et on verifie la dispo des terrains
		let family = [];
		for (let m in this.maisons.maisons) {
			let maison = this.maisons.maisons[m];
			if (!family[maison.groupe.nom]) {
				family[maison.groupe.nom] = true;
				let free = true;
				for (let idf in maison.groupe.fiches) {
					let fiche = maison.groupe.fiches[idf];
					if (fiche.statut !== ETAT_LIBRE && !this.equals(fiche.joueurPossede)) {
						free = false;
					}
				}
				if (free) {
					return true;
				}
			}
		}
		return false;
	}

	/* Fonction appelee avant que les des ne soit lances, lorsqu'il est en prison */
	/* Regle : si on est au debut du jeu, on sort de prison pour acheter des terrains.
     * Si on est en cours de jeu et que le terrain commence a etre miné, on reste en prison */
	actionAvantDesPrison(buttons) {
		setTimeout( () =>{
			// Cas 1 : on prend la carte de sortie
			let getOut = this.getOutPrison();
			if (getOut) {
				if (buttons["Utiliser carte"] != null) {
					buttons["Utiliser carte"]();
				} else {
					buttons["Payer"]();
				}
			} else {
				buttons["Attendre"]();
			}
		}, IA_TIMEOUT);
	}

	/* On sort de prison prison dans les cas suivants
     * 1) Le joueur a moins de deux groupes et le terrain n'est pas mine (moyenne des loyers < 20% de ses moyens) avec au moins 3 terrains de vendu
     * 2) Si le terrain est miné (moyenne < 30% des moyens) mais que le joueur a absolument besoin d'un terrain encore libre pour termine son groupe (pas de groupe)
     * 3) On sort de prison pour acheter en debut de jeu
     * Corolaire, on reste en prison
     * 1) Si le joueur a au moins deux groupes
     * 2) Si le terrain est miné > 15% et qu'il n'a pas un terrain a recuperer absoluement
     * 3) Si le terrain est très miné > 30%, quelque soit sa recherche de terrain
     */
	getOutPrison() {
		let loyerStat = this.comportement.getLoyerMoyen(this);
		let groupesPossibles = this.maisons.getGroupesPossibles();
		// On peut augmenter le risque si les terrains rouges et oranges sont blindes (sortie de prison)
		// depend de l'argent dispo et du besoin d'acheter un terrain (libre et indispensable pour finir le groupe)
		// Cas pour rester en prison
		if (this.maisons.findConstructiblesGroupes().size() >= 2) {
			return false;
		}
		if (groupesPossibles.length > 0 && loyerStat.montant < (this.montant * 0.3)) {
			return true;
		}
		return !(loyerStat.nb >= 4 && loyerStat.montant > this.montant * 0.15);
	}

// decide si achete ou non la maison
// On se base sur la politique, les fiches obtenues par les autres
	gererAchat(boutonAchat) {
		boutonAchat.click();
	}
}

class NetworkJoueurOrdinateur extends JoueurOrdinateur{
	constructor(numero, nom, color,argent,montantDepart){
		super(numero,nom,color,argent,montantDepart);
	}
	moveTo(nb){
		let nextCase = this.pion.deplaceValeursDes(nb);
		Notifier.moveTo(GestionFiche.buildId(nextCase),this);
		this.joueSurCase(nextCase);
	}
	notifyDices(dices,event){
		Notifier.dices(dices,event,this);
	}
	notifySelect(){
		Notifier.notifySelect(this);
	}
	notifyAcheteMaison(terrain,montant){
		Notifier.notifyAcheteMaison(terrain,montant,this);
	}
	gagner(montant) {
		this.setArgent(this.montant + montant);
		Notifier.gagner(montant,this);
	}
	notifyPay(montant){
		Notifier.payer(montant,this);
	}
}

export {JoueurOrdinateur,NetworkJoueurOrdinateur};
