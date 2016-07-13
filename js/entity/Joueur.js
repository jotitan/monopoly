/* Joueurs du jeu, version robot et manuel */
/* Objet central sur la gestion du jeu */
/* Depend de Strategie, Comportement, GestionEnchere, GestionFiche, GestionDes, Pion, GestionEnchereDisplayer, InfoMessage */

/* Joueur ordinateur */
/* Il faut, a la creation, definir le style de jeu : prudent (achat des deux premiere lignes), agressif (achete tout)
	mode fric (achete les plus chers).*/

function JoueurOrdinateur(numero, nom, color, argent) {
	Joueur.call(this, numero, nom, color,argent);
	this.canPlay = false;
	this.initialName = nom;
	/* Strategie : definit le comportement pour l'achat des maisons */
	this.strategie = null;
	/* Comportement : definit le rapport e l'argent. Inclu la prise de risque */
	this.comportement = null;
	this.nom = nom;
	this.rejectedPropositions = []; // Sotcke les propositions rejetees

	/* Determine les caracteristiques d'un ordinateur*/
	this.init = function (idStrategie, idComportement) {
		this.strategie = (idStrategie == null) ? GestionStrategie.createRandom() : GestionStrategie.create(idStrategie);
		this.comportement = (idComportement == null) ? GestionComportement.createRandom() : GestionComportement.create(idComportement);
	}

	this.saveMore = function (data) {
		data.comportement = this.comportement.id;
		data.strategie = this.strategie.id;
		// Charge l'historique des propositions (derniere proposition du terrain)
		data.rejectedPropositions = [];
        for (var id in this.rejectedPropositions) {
			var proposition = this.rejectedPropositions[id][this.rejectedPropositions[id].length -1].proposition;
			var terrains = [];	// On ne garde que les ids des fiches pour eviter les cycles a la sauvegarde
            for(var t in proposition.terrains){
                terrains.push(proposition.terrains[t].id);
            }
            data.rejectedPropositions.push({
				id: id,
				proposition: {
					compensation:proposition.compensation,
					terrains:terrains
				}
			});
		}			
	}

	this.loadMore = function (data) {	
		this.init(data.strategie, data.comportement);
		this.rejectedPropositions = [];
		if (data.rejectedPropositions != null) {
			for (var id in data.rejectedPropositions) {
				var p = data.rejectedPropositions[id].proposition;
				var terrains = [];
				if(p.terrains!=null){
					for(var t in p.terrains){
						terrains.push(GestionFiche.getById(p.terrains[t]));
					}
				}
				// On ajoute la proposition dans le tableau
				this.rejectedPropositions[data.rejectedPropositions[id].id] = [{
					proposition:{
                        compensation:p.compensation,
					    terrains:terrains
                    }
				}];
			}
		}
	}

	// Fonction appelee lorsque le joueur a la main
	this.joue = function () {
		// On reevalue a intervalle regulier la strategie
		this.changeStrategie();
		// On fait des demandes d'echange de proprietes. Asynchrone, le reste du traitement est  en callback
		var joueur = this;
		this.echangeProprietes(function () {
			// Construit des maisons / hotels
			joueur.buildConstructions();
			// rachete les hypotheques
			joueur.rebuyHypotheque();
			// on lance les des
			$.trigger('monopoly.debug',{message:'joueur ' + joueur.nom + ' joue'});
			GestionDes.lancer();
		});
	}

	/* Choisi la case qui l'interesse le plus */
	/* 1) Cherche dans les terrains libres celui qu'il prefere */
	/* 2) Si pas de terrain libre, choisi la case prison (protege le plus) si besoin */	
	this.choisiCase = function(callback){
		var fiches = GestionFiche.getFreeFiches();
		var maxInteret;
		var maxFiche;
		fiches.forEach(function(fiche){
			var interet = this.strategie.interetGlobal(fiche,this,false).interet;
			if(interet !=0 && (maxInteret == null || interet > maxInteret)){
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
	this.choisiDes = function(des1,des2,callback){
		var f1 = {fiche:this.pion.deplaceValeursDes(des1),total:des1};
		var f2 = {fiche:this.pion.deplaceValeursDes(des2),total:des2};
		var f3 = {fiche:this.pion.deplaceValeursDes(des1 + des2),total:des1+des2};
		
		var maxInteret = -1000;
		var total = 0;
		[f1,f2,f3].forEach(function(f){
			var value = this._analyseCase(GestionFiche.get(f.fiche));
			if(value > maxInteret){
				total = f.total;
				maxInteret = value;
			}
		},this);
		callback(total);
	}
	
	/* Determine l'interet d'une case. Plus il est elevé, plus il est important */
	/* Interet pour taxe depend du montant. */
	/* Case depart mieux que terrain inutile mais moins que terrain utile */
	/* Prison depend de l'interet a y rester. Si non, equivaut a une taxe de 2000 */
	/* Interet d'un terrain depend des moyens qu'on a */
	/* TODO : dans le cas d'enchere immediate, empecher de tomber sur un terrain qui interesse un autre ? */
	this._analyseCase = function(fiche){
		var interet = 0;
		if(fiche.isPropriete() == true){
			interet = fiche.statut == ETAT_LIBRE ? 
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
	this.actionApresDes = function (buttons, propriete) {
		if (buttons == null) {
			return;
		}
		var _self = this;
		setTimeout(function () {
			if (buttons.Acheter != null && propriete != null) {
				var interet = _self.strategie.interetGlobal(propriete).interet;
				var comportement = _self.comportement.getRisqueTotal(_self, propriete.achat);
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
			for (var i in buttons) {
				if (i != "Acheter") {
					buttons[i]();
					return;
				}
			}
		}, IA_TIMEOUT);
	}

	this.notifyAcceptProposition = function (callback) {
		if (callback) {
			callback();
		}
	}

	this.notifyRejectProposition = function (callback, terrain, proposition) {
		// On enregistre le refus du proprietaire : le terrain, la proposition et le numero de tour
		// utiliser pour plus tard pour ne pas redemander immediatement
		if (this.rejectedPropositions[terrain.id] == null) {
			this.rejectedPropositions[terrain.id] = [];
		}
		this.rejectedPropositions[terrain.id].push({
			nbTours: globalStats.nbTours,
			proposition: proposition
		});
		if (callback) {
			callback();
		}
	}

	/* Cherche a echanger des proprietes. Methode bloquante car negociation avec d'autres joueurs
	 * Se deroule en plusieurs etapes :
	 * Calcule les terrains qui l'interessent chez les adversaires
	 * Penser a prendre les affinites en compte
	 * @param callback : traitement a lancer a la fin des echanges
	 * Il faut retenir les demandes rejetees pour proposer plus et ne pas demander a chaque tour
	 */
	this.echangeProprietes = function (callback) {
		// Quand echange uniquement apres la vente de tous les terrains
		if(VARIANTES.echangeApresVente && GestionFiche.isFreeFiches()){
			if(callback){
				callback();
			}
			return;
		}
		// Proprietes qui interessent le joueur
		var proprietes = this.findOthersInterestProprietes();
		if (proprietes.length == 0) {
			callback();	
			return;
		}
		var nbGroupesPossedes = this.findGroupes().length;
		/* On calcule l'importance d'echanger (si des groupes sont presents ou non) */
		var interetEchange = Math.pow(1 / (1 + nbGroupesPossedes), 2);

		/* On cherche les monnaies d'echanges. */
		var proprietesFiltrees = [];
		for (var p in proprietes) {
			var prop = proprietes[p];
			var maison = prop.maison;
			// On verifie si une demande n'a pas ete faite trop recemment
			if (this._canAskTerrain(maison)) {
				var last = this._getLastProposition(maison);
				var joueur = maison.joueurPossede;
				prop.compensation = 0;
				// Calcule les monnaies d'echange
				prop.deals = maison.joueurPossede.findOthersInterestProprietes(this,maison);
           	if (prop.deals.length == 0) {
					// On ajoute les terrains non importants (gare seule, compagnie)
					var othersProprietes = this.findUnterestsProprietes();
           		var montant = 0;
					if (othersProprietes != null && othersProprietes.proprietes != null && othersProprietes.proprietes.length > 0) {
						// On en ajoute. En fonction de la strategie, on n'ajoute que les terrains seuls dans le groupe (peu important)
						for (var i = 0; i < othersProprietes.proprietes.length && montant / maison.achat < 0.7; i++) {
							var terrain = othersProprietes.proprietes[i];
							// Il ne faut pas proposer un terrain du meme groupe que le terrain demande car pas forcement de la strategie
							// Deux terrains qui ne sont pas de la strategie sont potentiellement interessant a garder
							if (!this.strategie.interetPropriete(terrain) && (terrain.groupe == null || !terrain.groupe.equals(maison.groupe))) {
								// On le refourgue
								prop.deals.push(terrain);
								montant += terrain.achat;
							}
						}
					}

					// Permettre calcul compensation quand traitement fournit des terrains < 80% du montant
					if (montant / maison.achat < 0.8) {
						prop.compensation = this.evalueCompensation(joueur, maison, interetEchange, last) - montant;
					}
				} else {
					// Si trop couteux, on propose autre chose, comme de l'argent. On evalue le risque a echanger contre ce joueur.  
					// On teste toutes les monnaies d'echanges
					var monnaies = this.chooseMonnaiesEchange(prop, prop.monnaiesEchange, true, nbGroupesPossedes >= 2, last);
					if (monnaies == null || monnaies.length == 0) {
						prop.compensation = this.evalueCompensation(joueur, maison, interetEchange, last);
						prop.deals = null;
					} else {
						prop.deals = monnaies;
					}
				}
				// Si aucune proposition, on ajoute les autres terrains dont on se moque (terrains constructibles mais non intéressant)
            // Potentiellement un terrain de la strategie peut tout de meme etre proposee (une gare par exemple)
				if ((prop.deals == null || prop.deals.length == 0) && prop.compensation == 0) {
					var terrains = this.findOthersProperties(proprietes);
               var montant = 0;
					for (var i = 0; i < terrains.length && montant / maison.achat < 0.7; i++) {
						var terrain = terrains[i];
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
		// On choisit la propriete a demander en echange
		if (proprietesFiltrees.length != 0) {
			for (var idx in proprietesFiltrees) {
				var p = proprietesFiltrees[idx];
				var proposition = {
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
					callback();
					return;
				}
			}
		}
		// Aucun echange n'est fait, on continue
		callback();
	}

	/* Verifie que le terrain peut etre demande a l'echange (si une precedente demande n'a pas été faite trop recemment) */
	this._canAskTerrain = function (terrain) {
		// On prend le dernier
		var last = this._getLastProposition(terrain);
		if (last != null) {
			var pas = 3 + (Math.round((Math.random() * 1000) % 3));
			return last.nbTours + pas < globalStats.nbTours;
		}

		return true;
	}

	/* Renvoie la derniere proposition faite pour un terrain */
	this._getLastProposition = function (terrain) {
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
	this.traiteRequeteEchange = function (joueur, maison, proposition) {
		// Si aucune compensation, on refuse
		if ((proposition.terrains == null || proposition.terrains.length == 0) && (proposition.compensation == null || proposition.compensation == 0)) {
			return GestionEchange.reject(this);
		}
		var others = this.findOthersInterestProprietes(joueur);
		var infos = this._calculatePropositionValue(maison, joueur, proposition, others);
		if (infos.critere >= 3) {
			return GestionEchange.accept(this);
		}
		if (infos.critere <= 0) {
			return GestionEchange.reject(this);
		}

		var contreProposition = {
			terrains: [],
			compensation: 0
		};
		var turn = 0; // Pas plus de 3 tour de calcul
		do {
			contreProposition = this._calculateContreProposition(joueur, proposition, contreProposition, infos.recommandations, maison, others);
			infos = this._calculatePropositionValue(maison, joueur, contreProposition, others);
		} while (infos.critere < 3 && turn++ < 3);

		if (infos.critere < 3) { // Impossible a generer
			return GestionEchange.reject(this);
		}
		return GestionEchange.contrePropose(contreProposition, this);
	}

	this._calculateContreProposition = function (joueur, proposition, contreProposition, recommandations, terrain, others) {
		if (recommandations["TERRAIN_DISPO"] == 1 || recommandations["TERRAIN_NON_LISTE"] == 1) {
			// terrain dispo non propose, on ajoute tant que la valeur du terrain n'est pas atteinte
			var montant = 0;
			for (var i = 0; i < others.length; i++) {
				if (!others[i].maison.groupe.equals(terrain.groupe)) { // si on est interesse par le meme groupe
					contreProposition.terrains.push(others[i].maison);
					montant += others[i].maison.achat;
					if (montant > terrain.achat) {
						break;
					}
				}
			}
			/* Ajout d'un terrain de la propal originale */
			if (montant < terrain.achat && recommandations["TERRAIN_NON_LISTE"] == 1) {
				// On ajoute un terrain propose avant
				var done = false;
				for (var i = 0; i < proposition.length && !done; i++) {
					if (!contreProposition.terrains.contains(proposition.terrains[i])) {
						contreProposition.terrains.push(proposition.terrains[i]);
						done = true;
					}
					if (!done) {
						// Il faut proposer autre chose, autre terrain
						var uselessPropritetes = joueur.findUnterestsProprietes();
						if (uselessProprietes.proprietes.length > 0) {
							contreProposition.terrains.push(uselessProprietes.proprietes[0]);
						}
					}
				}
			}
		}
		if (recommandations["ARGENT_INSUFFISANT"] == 1) {
			contreProposition.compensation += terrain.achat / 2;
		}
		return contreProposition;
	}

	/* Calcule la valeur d'une proposition d'echange */
	/* @return : renvoie la valeur de la proposition ainsi que des recommandations (utilise pour les contre propositions) */
	this._calculatePropositionValue = function (maison, joueur, proposition, others) {
		var recommandations = []; // Enregistre des parametres pour la contre proposition

		var interesetMeToo = false; // Indique qu'on est aussi interesse par ce groupe
		for (var i = 0; i < others.length; i++) {
			if (maison.groupe.equals(others[i].maison.groupe)) {
				interesetMeToo = true;
			}
		}
		var critereTerrains = 0;
		var critereArgent = 0;
		// Gestion des terrains
		if ((proposition.terrains != null && proposition.terrains.length > 0)) {
			var useList = false;
			for (var t in proposition.terrains) {
				var terrain = proposition.terrains[t];
				// On verifie si dans others et on note l'ordre dans la liste, signe de l'interet
				var interetTerrain = null;
				for (var i = 0; i < others.length; i++) {
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
				recommandations["TERRAIN_NON_LISTE"] = 1;
			}
		} else {
			if (others != null && others.length > 0) {
				// On verifie si le terrain demande n'appartient pas un groupe qui nous interesse
				var length = others.length - ((interesetMeToo) ? 1 : 0);
				critereTerrains -= length;
				recommandations["TERRAIN_DISPO"] = 1; // Indique qu'un terrain peut etre choisi en contre proposition
			}
		}
		// Gestion de la compensation
		if (proposition.compensation != null) {
			critereArgent = proposition.compensation / maison.achat;
			/* On ajoute de l'importance si proposition superieur au fond propre */
			if (this.montant < proposition.compensation) {
				critereArgent += Math.min(1.5, (proposition.compensation / this.montant) - 1);
			} else {
				recommandations["ARGENT_INSUFFISANT"] = 1;
			}
		} else {
			recommandations["NO_ARGENT"] = 1;
		}

		/* Confirme le traitement ou le durci. Prend le pas sur la decision calculee  */
		var strategie = this.strategie.acceptSwapTerrain(maison, joueur, others, interesetMeToo);

		// On melange le tout
		var critere = (critereTerrains + critereArgent) * strategie;
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
	this.traiteContreProposition = function (proposition, joueur, maison) {
		if (proposition.terrains.length == 0 && proposition.compensation == 0) {
			return GestionEchange.reject(this);
		}
		/* On evalue la pertinence  */
		var others = this.findOthersInterestProprietes(joueur);
		var infos = null;
		if (proposition.terrains.length > 0) {
			// On inverse les parametres
			var prop = {
				terrains: [maison],
				compensation: proposition.compensation * -1
			};
			var terrain = proposition.terrains[0];
			var infos = this._calculatePropositionValue(terrain, joueur, prop, others);
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
	this.evalueCompensation = function (joueur, maison, interetTerrain, oldProposition) {
		// On calcule les sommes dispos. En fonction de l'interet pour le terrain, on peut potentiellement hypothequer
		var budgetMax = this.comportement.getBudget(this, (interetTerrain != null && interetTerrain > 2));
		var budget = Math.min(budgetMax, maison.achat);
		if (oldProposition != null && oldProposition.proposition.compensation >= budget) {
			budget = Math.min(this.montant, oldProposition.proposition.compensation * this.comportement.getFactorForProposition());
			// On plafonne le budget (fonction logarithmique)
			var plafondBudget = (14 - Math.log(maison.achat)) * maison.achat;
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
	this.isDangerous = function (groupe) {
		// Critere 1, nombre de maison par terrain pouvant etre achete
		var nbMaison = (this.argent / groupe.maisons[0].prixMaison) / groupe.fiches.length;
		// compte les autres groupes
		var criterePrix = (groupe.maisons[0].loyers[nbMaison]) / (InitMonopoly.plateau.infos.montantDepart*5);
		// Ligne presente
		var groups = this.findGroupes();
		var isLigne = false;
		for (var g in groups) {
			if (groups[g].isVoisin(groupe)) {
				isLigne = true;
			}
		}
		// Resultat : nb maison, le fait de faire une ligne et une ponderation par le prix
		var moteur = (nbMaison + criterePrix) * (isLigne ? 2 : 1);

		return moteur >= 5;
	}

	/* Choisis les terrains qu'il est possible de ceder en echange du terrain */
	/* Se base sur la dangerosite du terrain (n'est pas pris en compte) et sur la valeur des terrains par rapport a ce qui est demande */
	/* @param testDangerous : si le joueur est le seul fournisseur et qu'on a pas le choix, on prend le terrain*/
	/* @param strict : si strict est vrai, on ne relance pas l'algo en etant moins dangereux. Le joueur decide de ne pas faire de cadeau */
	/* @param oldProposition : derniere proposition refusee qui a ete faite, plus laxiste dans ce cas */
	this.chooseMonnaiesEchange = function (terrainVise, terrains, testDangerous, strict, oldProposition) {
		if (terrains == null || terrains.length == 0) {
			return [];
		}
		var proposition = [];
		var valeur = 0;
		// Si seul fournisseur, il faut etre plus laxiste.
		for (var t in terrains) {
			if (!terrainVise.joueurPossede.isDangerous(terrains[t].groupe) || !testDangerous) {
				// On regarde si c'est necessaire de l'ajouter
				if (valeur == 0) {
					proposition.push(terrains[t]);
					valeur += terrains[t].achat;
				} else {
					var rapport = (Math.abs(1 - terrainVise.achat / valeur)) / (Math.abs(1 - terrainVise.achat(valeur + terrains[t].achat)));
					if (rapport > 1) {
						proposition.push(terrains[t]);
						valeur += terrains[t].achat;
					}
				}
			}
		}
		if (proposition.length == 0 && !strict && (testDangerous || oldProposition != null)) {
			// On relance sans etre strict
			return this.chooseMonnaiesEchange(terrainVise, terrains, joueur, false, strict);
		}
		return proposition;
	}

	this.initEnchere = function (transaction, terrain) {
		if (this.equals(terrain.joueurPossede)) {
			return;
		}
		// On calcule le budget max que le joueur peut depenser pour ce terrain
		if (this.currentEchange != null) {
			throw "Impossible de gerer une nouvelle enchere";
		}
		var interet = this.strategie.interetGlobal(terrain, this, true);
		var budgetMax = this.comportement.getMaxBudgetForStrategie(this, interet.interet);
		this.currentEnchere = {
			transaction: transaction,
			terrain: terrain,
			budgetMax: budgetMax,
			joueurInteresse:interet.joueur
		}
	}

	this.updateInfoEnchere = function (montant, lastEncherisseur) {}

	this.updateEnchere = function (transaction, jeton, montant, lastEncherisseur) {
		if (transaction != this.currentEnchere.transaction) {
			return;
		}
		// Le joueur a l'enchere courante la plus haute
		if (this.equals(lastEncherisseur)) {
			return;
		}
		// On temporise la reponse de IA_TIMEOUT + random de ms
		var timeout = IA_TIMEOUT * (Math.random() + 1);
		var _self = this;
		setTimeout(function () {
			if(_self.currentEnchere == null){return;}
			if (montant > _self.currentEnchere.budgetMax || 
			(_self.currentEnchere.joueurInteresse!=null && !_self.currentEnchere.joueurInteresse.equals(lastEncherisseur))) {
				// Exit enchere
				GestionEnchere.exitEnchere(_self);
			} else {
				// Fait une enchere. Dans le cas d'un blocage, joueurInteresse est renseigne. Enchere uniquement s'il est le dernier
				try {
					GestionEnchere.doEnchere(_self, montant, jeton);
				} catch (e) {
					// Si une enchere a deja ete faite et update, on arrete la demande (joueur trop lent)
				}
			}
		},timeout);
	}

	this.notifyExitEnchere = function (joueurs) {}

	/* Comportement lorsque l'enchere est terminee */
	this.endEnchere = function () {
		this.currentEnchere = null;
		GestionEnchere.checkEndNotify(this);
	}

	/* Permet de faire du blocage de construction : vente d'un hotel pour limiter l'achat de maison, decision d'acheter un hotel pour bloquer.
	 * Se base sur les terrains constructibles des adversaires ainsi que de leur tresorie.
	 * Retourne vrai s'il faut bloquer le jeu de constructions
	 */
	this.doBlocage = function () {
		// On compte le nombre joueurs qui peuvent construire
		GestionJoueur.forEach(function(joueur){
			if (!this.equals(this)) {
				var groups = joueur.findGroupes();
				if (groups.size() > 0) {
					// On verifie si le budget est important ()
					// On compte le potentiel de maison achetables
					var nbMaisons = 0;
					var coutMaisons = 0;
					for (var color in groups) {
						var group = groups[color];
						count += group.proprietes.length;
						for (var index in group.proprietes) {
							var maison = group.proprietes[index];
							nbMaisons += 5 - maison.nbMaison;
							coutMaisons += (5 - maison.nbMaison) * maison.prixMaison;
						}
					}
					var budgetMin = (coutMaisons / nbMaisons) * 3;
					if (nbMaisons > 3 && budgetMin < joueur.montant) {
						// On doit bloquer la construction
						return true;
					}
				}
			}
		},this);
		return false;
	}

	/* Override de la methode pere */
	this.resolveProblemeArgent = function (montant, callback) {
		$.trigger('monopoly.debug', {
			message: 'Resoud probleme argent'
		});
		var joueur = this;

		/* Ordre de liquidations :
		 * 1) Terrains non constructibles, terrains non groupes, terrains groupes non construits
		 * 2) Vente des maisons les maisons / hotels les mains rentables prochainement (base sur les stats des prochains passages)
		 * 3) Hypotheque des terrains precedemment construits
		 **/

		/* CAS 1 */
		var maisons = [];
		for (var index in this.maisons) {
			var maison = this.maisons[index];
			// On prend les terrains non hypotheques et non construits
			if (maison.statutHypotheque == false && !maison.isGroupeeAndBuild()) {
				maisons.push(maison);
			}
		}

		var findInfo = function (maison) {
			switch (maison.type) {
			case "gare":
				return -1;
				break;
			case "compagnie":
				return -2;
				break;
			default:
				return (maison.isTerrain()) ? maison.groupe.getInfos(joueur) : 0;
			}
		}
		maisons.sort(function (a, b) {
			var infosA = findInfo(a);
			var infosB = findInfo(b);

			return infosA - infosB;
		});

		$.trigger("monopoly.debug", {
			message: "PHASE 1"
		});
		for (var index = 0; index < maisons.length && this.montant < montant; index++) {
			var maison = maisons[index];
			maison.hypotheque();
		}

		/* CAS 2 */
		if (this.montant < montant) {
			$.trigger("monopoly.debug", {
				message: "PHASE 2"
			});
			// 3 Terrains construits, on vend les maisons dessus
			// On recupere les groupes construits classes par ordre inverse d'importance. On applique la meme regle que la construction tant que les sommes ne sont pas recupereres
			var sortedGroups = [];
			try {
				sortedGroups = this.getGroupsToConstruct("ASC", 0.1);
			} catch (e) {}
			// On boucle (tant que les sommes ne sont pas recouvres) sur le groupe pour reduire le nombre de maison, on tourne sur les maisons
			var run = true;
			for (var idGroup in sortedGroups) {
				var group = sortedGroups[idGroup];
				// On boucle pour reduire les maisons au fur et a mesure
				var proprietes = group.proprietes;
				// On trie par nombre de maison
				proprietes.sort(function (a, b) {
					if (a.nbMaison == b.nbMaison) {
						return 0;
					}
					return a.nbMaison < b.nbMaison ? 1 : -1;
				});
				var currentId = 0;
				var nbNoHouse = 0;
				var boucle = 0; // Securite pour eviter boucle infinie
				var maisonVendues = 0;
				while (this.montant < montant && nbNoHouse < proprietes.length && boucle++ < 100) {
					var p = proprietes[currentId];
					if (p.nbMaison == 0) {
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
			var maisons = [];
			for (var index in this.maisons) {
				var maison = this.maisons[index];
				// On prend les terrains non hypotheques
				if (maison.statutHypotheque == false) {
					maisons.push(maison);
				}
			}
			// On trie par montant (moins cher en premier). A deporter dans la strategie
			maisons.sort(function (a, b) {
				return a.achat - b.achat;
			});
			for (var index = 0; index < maisons.length && this.montant < montant; index++) {
				var maison = maisons[index];
				maison.hypotheque();
			}
			if (this.montant < montant) {
				// Cas impossible car verification des fonds fait avant
				this.doDefaite();
				if (callback) {
					callback();
				}
			}
		}
		// Somme recouvree
		this.setArgent(this.montant - montant); // Paiement de la dette
		this.bloque = false;
		if (callback) {
			callback();
		}
		return true;
	}

	this.getNbGroupConstructibles = function () {
		var nb = 0;
		var tempGroup = [];
		for (var idx in this.maisons) {
			var maison = this.maisons[idx];
			if (maison.isGroupee() && tempGroup[maison.groupe.nom] == null) {
				nb++;
				tempGroup[maison.groupe.nom] = 1;
			}

		}
		return nb;
	}

	/* Renvoie la liste des groupes a construire trie. 
	 * @param sortType : Tri des groupes en fonction de l'importance. ASC ou DESC
	 */
	this.getGroupsToConstruct = function (sortType, level) {
		var groups = this.findGroupes(); // structure : [color:{color,proprietes:[]}]
		// Pas de terrains constructibles
		if (groups.size() == 0) {
			throw "Impossible";
		}
		// On determine les terrains les plus rentables a court terme (selon la position des joueurs)
		var maisons = this.comportement.getNextProprietesVisitees(this, level);
		// On Calcule pour chaque maison des groupes (meme ceux sans interet) plusieurs indicateurs : proba (pondere a 3), la rentabilite (pondere a 1)
		var totalMaisons = 0; // Nombre total de proprietes constructibles
		for (var color in groups) {
			var group = groups[color];
			group.proba = 0;
			group.rentabilite = 0;
			group.lessThree = 0;
			group.interetGlobal = 0;
			for (var index in group.proprietes) {
				var propriete = group.proprietes[index];
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
		var sortedGroups = [];
		for (var color in groups) {
			var group = groups[color];
			group.interetGlobal = group.proba + group.rentabilite + ((group.lessThree > 0) ? 0.5 : 0);
			sortedGroups.push(group);
		}
		var GREATER_VALUE = (sortType == "ASC") ? 1 : -1;
		var LESSER_VALUE = (sortType == "ASC") ? -1 : 1;

		sortedGroups.sort(function (a, b) {
			if (a.interetGlobal == b.interetGlobal) {
				return 0;
			}
			if (a.interetGlobal > b.interetGlobal) {
				return GREATER_VALUE;
			}
			return LESSER_VALUE;
		});
		return sortedGroups;
	}

	/* Renvoie les groupes construits */
	/* @param nbMaison : nombre de maison moyen qui servent de palier */
	this.hasConstructedGroups = function (nbMaison) {
		var nb = nbMaison || 0;
		var groups = this.findGroupes();
		for (var idGroup in groups) {
			if (groups[idGroup].group.getAverageConstructions() > nb) {
				return true;
			}
		}
		return false;
	}

	/* Rachete les hypotheques */
	/* Cas : groupes presents (1) et construits (nb>3). Liquidite > 7 fois prix hypotheque */
	this.rebuyHypotheque = function () {
		// Hypotheque presentes
		var terrains = this.findMaisonsHypothequees();
		if (terrains == null || terrains.length == 0 && (this.getNbGroupConstructibles() > 0 && !this.hasConstructedGroups(3))) {
			return;
		}
		var pos = 0;
		while (pos < terrains.length && this.montant > 7 * terrains[pos].achatHypotheque) {
			terrains[pos++].leveHypotheque();
		}
	}

	/* Construit des maisons / hotels 
	 * Calcul les groupes constructibles, verifie l'argent disponible. Construit sur les proprietes ou peuvent tomber les adversaires (base sur leur position et les stats au des)
	 * Possibilite d'enregistrer tous les deplacements des joueurs pour affiner les cases les plus visitees
	 */
	this.buildConstructions = function () {
		var budget = this.comportement.getBudget(this);
		// Pas d'argent
		if (budget < InitMonopoly.plateau.infos.montantDepart / 4) {
			return;
		}
		var sortedGroups = [];
		try {
			sortedGroups = this.getGroupsToConstruct("DESC", 0.1);
			// On tri les maisons de chaque groupe en fonction du prix et du nombre (le moins de maison en premier puis l'achat le plus eleve
			for (var idGroup in sortedGroups) {
				sortedGroups[idGroup].proprietes.sort(function (a, b) {
					if (a.nbMaison == b.nbMaison) {
						if (a.achat == b.achat) {
							return 0;
						}
						return a.achat < b.achat ? 1 : -1
					}
					return a.nbMaison > b.nbMaison ? 1 : -1;
				});
			}
		} catch (e) {
			// Pas de terrains constructibles
			return;
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
		var stopConstruct = false;
		var currentMaison = 0;
		var currentGroup = 0;
		var seuil = 3; // Premier passage, ensuite passe a 4 ou 5
		var achats = {
			maison: 0,
			hotel: 0,
			terrains:[]
		};
		while (budget >= 5000 && !stopConstruct) {
			// On choisit une maison
			var group = sortedGroups[currentGroup];
			// Changement de group
			var maison = group.proprietes[currentMaison];
			// Si le seuil est atteint, on construit sur une autre maison ou sur un autre group
			if (maison.nbMaison >= seuil) {
				if (group.treat == null) {
					group.treat = 1;
				} else {
					group.treat++;
				}
				// Le goupe est traite, on passe au suivant
				if (group.treat == group.proprietes.length) {
					currentGroup++;
					currentMaison = 0;
					// Soit on a fait le tour, on recommence en changeant le seuil
					if (currentGroup >= sortedGroups.length) {
						if (seuil == 3) {
							seuil = 5;
							for (var color in sortedGroups) {
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
					if (maison.nbMaison == 4) { //hotel
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
		$('body').trigger('refreshPlateau');
	}


	/* Reevalue la strategie. Se base sur plusieurs parametres :
	 * Si peu de propriete ont ete achetees (<3)
	 * Si 60% des terrains qui l'interessent ont ete vendu
	 * Si aucune famille n'est completable (dans la strategie choisie)
	 * Si on possede deux terrains d'une strategie qui n'est pas la notre, on choisi cette strategie
	 * TODO : Si on a des groupes, que la strategie est bloquee et qu'on a de l'argent pour changer
	 */
	this.changeStrategie = function () {
		var localStats = this.strategie.getStatsProprietes();
		if (localStats.color.pourcent < 40 && this.countInterestProperties() <= 2 && !this.isFamilyFree()) {
			$.trigger("monopoly.debug", {
				message: this.nom + " cherche une nouvelle strategie"
			});
			// On change de strategie. Une nouvelle strategie doit posseder au moins 60% de ses terrains de libre
			for (var i in GestionStrategie.getAll()) {
				var s = GestionStrategie.create(i);
				if (s.name != this.strategie.name) {
					var strategieStats = s.getStatsProprietes();
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
	this.countInterestProperties = function () {
		var count = 0;
		for (var i = 0; i < this.maisons.length; i++) {
			if (this.strategie.groups.contains(this.maisons[i].color)) {
				count++;
			}
		}
		return count;
	}

	/* Indique s'il existe des familles que je peux encore posseder sans echange
	 * Se base sur les maisons possedees et non celle de la strategie =>TODO
	 */
	this.isFamilyFree = function () {
		// On parcourt les terrains et on verifie la dispo des terrains
		var family = new Array();
		for (var m in this.maisons) {
			var maison = this.maisons[m];
			if (!family[maison.groupe.nom]) {
				family[maison.groupe.nom] = true;
				var free = true;
				for (var idf in maison.groupe.fiches) {
					var fiche = maison.groupe.fiches[idf];
					if (fiche.statut != ETAT_LIBRE && !this.equals(fiche.joueurPossede)) {
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
	this.actionAvantDesPrison = function (buttons) {
		var _self = this;
		setTimeout(function () {
			// Cas 1 : on prend la carte de sortie
			var getOut = _self.getOutPrison();
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
	this.getOutPrison = function () {
		var loyerStat = this.comportement.getLoyerMoyen(this);
		var groupesPossibles = this.getGroupesPossibles();
		// On peut augmenter le risque si les terrains rouges et oranges sont blindes (sortie de prison)
		// depend de l'argent dispo et du besoin d'acheter un terrain (libre et indispensable pour finir le groupe)
		// Cas pour rester en prison    
		if (this.findGroupes().size() >= 2) {
			return false;
		}
		if (groupesPossibles.length > 0 && loyerStat.montant < (this.montant * 0.3)) {
			return true;
		}
		if (loyerStat.nb >= 4 && loyerStat.montant > (this.montant * 0.15)) {
			return false;
		}
		return true;
	}

	// decide si achete ou non la maison
	// On se base sur la politique, les fiches obtenues par les autres
	this.gererAchat = function (boutonAchat) {
		boutonAchat.click();
	}

	this.init();
}
	
/* Represente un joueur */
function Joueur(numero, nom, color,argent) {
	this.numero = numero;
	this.id = numero;
	this.nom = nom || '';
	this.color = color;
	this.montant = argent;
	this.maisons = new Array();
	this.enPrison = false;
	this.pion = null;
	this.nbDouble = 0;	// Nombre de tour en prison
	this.bloque = false; // Indique que le joueur est bloque. Il doit se debloquer pour que le jeu continue
	this.defaite = false;
	this.tourDefaite = null;
	this.cartesSortiePrison = []; // Cartes sortie de prison
	this.canPlay = true;
	this.equals = function (joueur) {
		if (joueur == null) {
			return false;
		}
		return this.numero == joueur.numero;
	}

	/* Sauvegarde un joueur */
	this.save = function () {
		// On sauvegarde id, nom, color,montant, prison, bloque, defaite, cartes, son type (manuel). Pas besoin des maisons (auto)
		var data = {
			canPlay: this.canPlay,
			id: this.id,
			nom: this.nom,
			color: this.color,
			montant: this.montant,
			enPrison: this.enPrison,
			bloque: this.bloque,
			defaite: this.defaite,
			cartesPrison: this.cartesSortiePrison.length,
			position: this.pion.position,
			axe: this.pion.axe
		};
		this.saveMore(data);
		return data;
	}

	this.load = function (data) {
		for (var name in data) {
			if (this[name] != null) {
				this[name] = data[name];
			}
		}
		this.setArgent(this.montant);            
		this.loadMore(data);
		// Position initiale, aucune action
		this.pion.goDirectToCell(data.axe, data.position);
		// Cas des cartes de prison
	}

	/* Template Method : les enfants peuvent la reimplementer */
	this.saveMore = function () {}

	this.loadMore = function (data) {}

	// Utilise la carte sortie de prison
	this.utiliseCarteSortiePrison = function () {
		if (this.cartesSortiePrison.length == 0) {
			throw "Impossible d'utiliser cette carte";
		}
		this.cartesSortiePrison[this.cartesSortiePrison.length - 1].joueurPossede = null;
		this.cartesSortiePrison.splice(this.cartesSortiePrison.length - 1, 1);
	}

	/* Renvoie les stats et infos du jour : 
	 * Nombre de tour, nombre de fois en prison
	 * Nombre de terrains, nombre de maison et hotel
	 * Argent disponible, argent apres vente maison / hypotheque, argent apres hypotheque
	 */
	this.getStats = function () {
		var statsJ = {
			prison: this.pion.stats.prison,
			tour: this.pion.stats.tour,
			argent: this.montant,
			argentDispo: this.montant,
			argentDispoHypo: this.montant,
			hotel: 0,
			maison: 0,
			strategie: this.strategie != null ? this.strategie.toString() : '-',
			comportement: this.comportement != null ? this.comportement.name : '-',
		};
		for (var index in this.maisons) {
			var maison = this.maisons[index];
			statsJ.hotel += parseInt(maison.hotel == true ? 1 : 0);
			statsJ.maison += parseInt(maison.hotel == false ? maison.nbMaison : 0);
			// Revente des constructions + hypotheque
			statsJ.argentDispo += (maison.statutHypotheque) ? 0 : (((maison.isTerrain()) ? (maison.nbMaison * (maison.prixMaison / 2)) : 0) + maison.achat / 2);
			// Revente uniquement des terrains non groupes
			statsJ.argentDispoHypo += (!maison.isGroupee() && !maison.statutHypotheque) ? maison.achat / 2 : 0; // hypotheque des terrains non groupes
		}
		return statsJ;
	}

	/* Selectionne le joueur */
	this.select = function () {
		if (this.div) {
			this.div.find('div:first').addClass('joueurCourant');
		}
		if (!this.enPrison) {
			this.nbDouble = 0;
		}
		this.joue();
	}

	this.getPosition = function () {
		return {
			pos: this.pion.position,
			axe: this.pion.axe
		};
	}

	/* Affiche la demande d'echange d'un joueur */
	this.traiteRequeteEchange = function (joueur, terrain, proposition) {
		// On affiche l'interface au joueur
		CommunicationDisplayer.show(joueur, this, terrain, proposition, this);
	}

	/* Affiche la contreproposition du joueur */
	this.traiteContreProposition = function (proposition, joueur, terrain) {
		CommunicationDisplayer.showContreProposition(proposition);
	}

	/* On affiche a l'utilisateur l'acceptation de la proposition */
	this.notifyAcceptProposition = function (callback) {
		// On affiche l'information
		CommunicationDisplayer.showAccept(callback);
	}

	/* On affiche a l'utilisateur le rejet de la proposition */
	this.notifyRejectProposition = function (callback) {
		CommunicationDisplayer.showReject(callback);
	}

	/* Initialise une mise aux encheres */
	/* @param transaction : numero de transaction pour communiquer */
	this.initEnchere = function (transaction, terrain) {
		GestionEnchereDisplayer.display(terrain, this);
	}

	/* Met a jour la derniere enchere qui a été faite (pour suivre l'avancement) quand le joueur ne participe plus */
	this.updateInfoEnchere = function (montant, lastEncherisseur) {
		GestionEnchereDisplayer.updateInfo(montant, lastEncherisseur, false);
	}

	/* Notifie lorsqu'un joueur quitte les encheres */
	this.notifyExitEnchere = function (joueur) {
		GestionEnchereDisplayer.showJoueurExit(joueur);
	}

	this.updateEnchere = function (transaction, jeton, montant, lastEncherisseur,isNewEnchere) {
		if(isNewEnchere){
			GestionEnchereDisplayer.clean();
		}
		GestionEnchereDisplayer.updateInfo(montant, lastEncherisseur, true, {
			transaction: transaction,
			jeton: jeton
		});
	}

	this.endEnchere = function (montant, joueur) {
		GestionEnchereDisplayer.displayCloseOption(montant, joueur);
	}

	/* Renvoie les maisons du joueur regroupes par groupe */
	this.getMaisonsGrouped = function () {
		var groups = [];
		for (var m in this.maisons) {
			var maison = this.maisons[m];
			if (maison.groupe == null) {
				if (groups["others"] == null) {
					groups["others"] = {
						groupe: 'Autres',
						color: 'black',
						terrains: [maison]
					};
				} else {
					groups["others"].terrains.push(maison);
				}
			} else {
				if (groups[maison.groupe.nom] == null) {
					groups[maison.groupe.nom] = {
						groupe: maison.groupe.nom,
						color: maison.groupe.color,
						terrains: [maison]
					};
				} else {
					groups[maison.groupe.nom].terrains.push(maison);
				}
			}
		}
		return groups;
	}

	/**
	 * Renvoie la liste des groupes presque complet (un terrain manquant) pour lequel le terrain est encore libre
	 */
	this.getGroupesPossibles = function () {
		var groups = [];
		for (var index in this.maisons) {
			var maison = this.maisons[index];
			if (!maison.isGroupee()) {
				// calcule les terrains libre de la meme couleurs
				var stat = {
					libre: 0,
					adversaire: 0
				};
				for (var id in maison.groupe.fiches) {
					var f = maison.groupe.fiches[id];
					if (!this.equals(f.joueurPossede)) {
						if (f.statut == ETAT_LIBRE) {
							stat.libre++;
						} else {
							stat.adversaire++;
						}
					}
				}
				if (stat.libre == 1 && stat.adversaire == 0) {
					groups.push(maison.color);
				}
			}
		}
		return groups;
	}

	// Cherche la position ou placer la nouvelle fiche (tri par couleur)
	this.cherchePlacement = function (maison) {
		for (var i = 0; i < this.maisons.length; i++) {
			if (this.maisons[i].color == maison.color) {
				return this.maisons[i].input;
			}
		}
		return null;
	}

	this.joueDes = function (sommeDes) {
		var nextCase = this.pion.deplaceValeursDes(sommeDes);
		this.joueSurCase(nextCase);
	}
	
	/* Joueur sur une case donnees */
	this.joueSurCase = function(fiche){
		this.pion.goto(fiche.axe, fiche.pos, doActions);
	}

	// Fonction a ne pas implementer avec un vrai joueur
	this.joue = function () {}
	
	/* Pour le des rapide, choisi la combinaison de des qu'il souhaite */
	this.choisiDes = function(des1,des2,callback){
		if(!callback){return;}
		
		var options = [
			{title:(des1 + ' + ' + des2),fct:function(){callback(des1+des2);}},
			{title:(des1),fct:function(){callback(des1);}},
			{title:(des2),fct:function(){callback(des2);}}
		];
		var message = 'Quel(s) dé(s) vous choisissez';
		InfoMessage.createGeneric(this,'Vous prenez le bus','green',message,options);		
	}
	/* Le joueur se deplace sur la case qu'il souhaite */
	this.choisiCase = function(callback){
		InfoMessage.create(this,"Triple dé","green","Choisissez votre case",function(){
			InitMonopoly.plateau.enableMouse(callback);
		});
	}
	
	// Fonction a ne pas implementer avec un vrai joueur
	this.actionApresDes = function (buttons, propriete) {}

	// Fonction a ne pas implementer pour un vrai joueur
	this.actionAvantDesPrison = function (buttons) {}

	// Achete une propriete
	/* @param montant : montant a payer si different du prix d'achat (cas des encheres) */
	this.acheteMaison = function (maison,montant) {
		montant = montant || maison.achat;
		// On verifie l'argent
		if (maison == null || montant > this.montant) {
			throw "Achat de la maison impossible";
		}
		if (maison.isLibre()) {
			this._drawTitrePropriete(maison);
			maison.vendu(this);
			this.payer(montant);
		}
	}

	/* Refuse l'achat d'une propriete. La banque peut mettre aux encheres le terrain */
	this.refuseMaison = function(maison,callback){
		$.trigger('monopoly.visiteMaison',{joueur:GestionJoueur.getJoueurCourant(),maison:maison});
		if(VARIANTES.enchereAchat){
			this._enchereByBanque(maison,callback);
		}else{
			if(callback){
				callback();
			}
		}
	}
	
	this._enchereByBanque = function(maison,callback){
		GestionEnchere.init(maison, maison.achat, true, callback);
	}

	this._drawTitrePropriete = function (maison) {
		var m = this.cherchePlacement(maison);
		var input = '<input type=\"button\" id=\"idInputFiche' + maison.id + '\" class=\"ui-corner-all fiche color_' + maison.color.substring(1) + '\" value=\"' + maison.nom + '\" id=\"fiche_' + maison.id + '\"/>';
		if (m != null) {
			m.after(input);
		} else {
			this.div.append(input);
		}
		maison.input = $('input[id="idInputFiche' + maison.id + '"]');
        if (maison.statutHypotheque == true) {
            maison.input.addClass('hypotheque');
        }
        maison.input.click(function () {
			FicheDisplayer.openDetail(GestionFiche.getById(maison.id), $(this));
		});
	}

	/* Permet de deplacer le terrain sur le joueur lors d'un echange */
	this.getSwapProperiete = function (maison) {
		maison.input.remove();
		maison.input = null;
		this._drawTitrePropriete(maison);
		
		// On supprime l'ancien proprio
		if(maison.joueurPossede){
			maison.joueurPossede.removeMaison(maison);
		}
		maison.setJoueurPossede(this);		
	}

	/* Supprime la maison de la liste */
	this.removeMaison = function (maison) {
		for (var i = 0; i < this.maisons.length; i++) {
			if (this.maisons[i].equals(maison)) {
				this.maisons.splice(i, 1);
				return;
			}
		}
	}

	// Envoi le joueur (et le pion) en prison
	this.goPrison = function () {
		this.enPrison = true;
		this.div.addClass('jail');
		this.nbDouble = 0;
		this.pion.goPrison(function(){GestionJoueur.change()});
		$.trigger("monopoly.goPrison", {
			joueur: this
		});
	}

	this.exitPrison = function () {
		this.enPrison = false;
		this.nbDouble = 0;
		this.div.removeClass('jail');
		$.trigger("monopoly.exitPrison", {
			joueur: this
		});
	}

	this.isEnPrison = function () {
		return this.enPrison;
	}

	this.setDiv = function (div) {
		this.div = div;
		this.setArgent(this.montant);
	}

	this.setArgent = function (montant) {
        if(montant == NaN){
            console.log("error montant")
        }
		this.montant = montant;
		$('.compte-banque', this.div).text(montant);
	}

	this.payerParcGratuit = function (parc,montant, callback) {
		try{
			this.payer(montant, function () {
				if (VARIANTES.parcGratuit) {
					parc.payer(montant);        					
				}
				if (callback) {
					callback();
				}
			});
		}catch(insolvable){
			if (callback) {
				callback();
			}
		}
	}

	this.setPion = function (color,img) {
		this.pion = new Pion(color, this,img);
	}

	/* Verifie si le joueur peut payer ses dettes */
	this.isSolvable = function (montant) {
		return this.getStats().argentDispo >= montant;
	}

	/* Paye la somme demandee. Si les fonds ne sont pas disponibles, l'utilisateur doit d'abord réunir la somme, on le bloque */
	/* @param callback : action a effectuer apres le paiement */
	this.payer = function (montant, callback) {
		// On verifie si c'est possible de recuperer les sommes
		if (this.getStats().argentDispo < montant) {
			// Banqueroute, le joueur perd
			this.doDefaite();
			throw "Le joueur " + this.nom + " est insolvable";
		}

		/* Verifie si le joueur peut payer */
		if (montant > this.montant) {
			this.bloque = true;
			var _self = this;
			this.resolveProblemeArgent(montant, callback);
		} else {
			this.setArgent(this.montant - montant);
			if (callback) {
				callback();
			}
		}
	}

	/* Paye une somme a un joueur */
	/* Si le joueur ne peut pas payer, une exception est lancee (il a perdu). On recupere le peut d'argent a prendre */
	/* Payer est potentiellement asynchrone (resolve manuel), on indique l'etape suivante en cas de reussite */
	this.payerTo = function (montant, joueur,callback) {
		argentDispo = this.getStats().argentDispo;
		try {
			this.payer(montant, function () {
				joueur.gagner(montant);
				if(callback!=null){
					return callback();
				}
				GestionJoueur.change();
			});
		} catch (insolvable) {
			// Le joueur n'est pas solvable, on se sert sur le reste
			if (joueur != null) { // Pb quand amende ?
				joueur.gagner(argentDispo);
			}
			GestionJoueur.change();
		}
	}

	this.gagner = function (montant) {
		this.setArgent(this.montant + montant);
	}

	/* Gestion de la defaite */
	this.doDefaite = function () {
		// On laisse juste le nom et on supprime le reste, on supprime le pion, on remet les maison a la vente
		// Le banquier peut mettre aux encheres les terrains
		for (var f in this.maisons) {
			this.maisons[f].libere();
		}
		$.trigger('refreshPlateau'); // Pour supprimer les terrains
		this.maisons = [];
		$('input', this.div).remove();
		this.pion.remove();
		// On affiche un style sur la liste
		$('.joueurCourant', this.div).removeAttr('style').addClass('defaite');
		this.setArgent(0);
		this.defaite = true;
		this.tourDefaite = globalStats.nbTours;
		$.trigger("monopoly.defaite", {
			joueur: this
		});
	}

	/* Resoud les problemes d'argent du joueur */
	/* @param montant : argent a recouvrer */
	/* @param joueur : beneficiaire */
	this.resolveProblemeArgent = function (montant, callback) {
		// On ouvre le panneau de resolution en empechant la fermeture
		this.montant -= montant;
		var _self = this;		
		var button = InfoMessage.create(this,"Attention", "red", "Vous n'avez pas les fonds necessaires, il faut trouver de l'argent", function () {
			// On attache un evenement a la fermeture
			var onclose = function (e) {
				if (_self.montant < 0) {
					// Message d'erreur pas possible
					InfoMessage.create(_self,"Attention", "red", "Impossible, il faut trouver les fonds avant de fermer");
					e.preventDefault();
				} else {
					_self.bloque = false;
					_self.setArgent(_self.montant);
					if (callback) {
						callback();
					}
				}
			}
			GestionTerrains.open(true, onclose);
		});
		return true;
	}

	this.getFichePosition = function () {
		return GestionFiche.getById(this.pion.axe + "-" + this.pion.position);
	}

	/** Renvoie la liste des terrains hypothecables : sans construction sur le terrain et ceux de la famille, pas deja hypotheques
	 * @return : la liste des terrains */
	this.findMaisonsHypothecables = function () {
		var proprietes = [];
		for (var i = 0; i < this.maisons.length; i++) {
			var propriete = this.maisons[i];
			if (propriete.statutHypotheque == false && propriete.nbMaison == 0) {
				// Aucune propriete possedee de la couleur ne doit avoir de maison
				var flag = true;
				for (var j = 0; j < this.maisons.length; j++) {
					if (this.maisons[j].color == propriete.color && this.maisons[j].nbMaison > 0) {
						flag = false;
					}
				}
				if (flag) {
					proprietes.push(propriete);
				}
			}
		}
		return proprietes;
	}

	/* Renvoie la liste des maisons hypothequees */
	this.findMaisonsHypothequees = function () {
		var proprietes = [];
		for (var i = 0; i < this.maisons.length; i++) {
			if (this.maisons[i].statutHypotheque == true) {
				proprietes.push(this.maisons[i]);
			}
		}
		return proprietes;
	}

	/*
	/**
	 * Renvoie la liste des groupes constructibles du joueur
	 * @returns {Array}
	 */
	this.findGroupes = function () {
		var colorsOK = new Array();
		var colorsKO = new Array();
		var groups = [];

		for (var i = 0; i < this.maisons.length; i++) {
			var m = this.maisons[i];
			if (m.isTerrain() == true && m.groupe != null) {
				// Deja traite, on possede la famille
				if (colorsOK[m.color] == true) {
					//groups[m.color].proprietes.push(m);
				} else {
					if (colorsKO[m.color] == null) {
						// On recherche si on a toutes les proprietes du groupe
						//var ok = true;
						var infos = m.groupe.getInfos(this);
						// Possede le groupe
						if (infos.free == 0 && infos.adversaire == 0 && infos.hypotheque == 0) {
							colorsOK[m.color] = true;
							groups[m.color] = {
								color: m.color,
								group: m.groupe,
								proprietes: m.groupe.fiches
							};
						} else {
							colorsKO[m.color] = true;
						}
					}
				}
			}
		}
		return groups;
	}

	/* Cherche les terrains qui interesse chez les adversaires */
	/* Les terrains sont tries par interet.
	 * Les criteres : la rentabilite, le nombre de terrain a acheter (1 ou 2), le fait de faire une ligne avec un groupe possede */
	/* @param joueur : ne recherche que les proprietes de ce joueur */
	/* @param excludes : terrain exclu, a ne pas renvoyer (celui vise par l'echange) */
	this.findOthersInterestProprietes = function (joueur,exclude) {
		var interests = [];
		var treatGroups = []; // groupes traites
		// On parcourt les terrains du joueur. Pour chaque, on etudie le groupe
		for (var index in this.maisons) {
			var maison = this.maisons[index];
			if (treatGroups[maison.groupe.color] == null) {
				// Structure : free,joueur,adversaire,nbAdversaires
				var infos = maison.groupe.getInfos(this);
				// Si tous les terrains vendus et un terrain a l'adversaire ou deux terrains a deux adversaires differents, on peut echanger
				if (infos.free == 0 && (infos.adversaire == 1 || infos.nbAdversaires > 1)) {
					for (var idx in infos.maisons) {
						if ((joueur == null || joueur.equals(infos.maisons[idx].joueurPossede))
							&& (exclude == null || !exclude.groupe.equals(infos.maisons[idx].groupe))) {
							if(exclude && maison.groupe.color == exclude.groupe.color){
								console.log("Meme groupe, rejet",maison.groupe.color,maison.groupe.color == exclude.groupe.color);
							} else{
                                interests.push({
                                    maison: infos.maisons[idx],
                                    nb: infos.maisons.length
                                }); // On ajoute chaque maison avec le nombre a acheter pour terminer le groupe
                            }
						}
					}
				}
				treatGroups[maison.groupe.color] = true;
			}
		}

		var groups = this.findGroupes();

		var _self = this;

		// On trie la liste selon rapport (argent de 3 maison / achat terrain + 3 maisons), le nombre de terrains a acheter
		// on rajoute le fait que ca appartient a la strategie et que c'est constructible
		interests.sort(function (a, b) {
			/* Premier critere : nombre de terrain a acheter pour finir le groupe */
			var critere1 = a.nb / b.nb;
			/* Second critere : rentabilite du terrain */
			var critere2 = a.maison.getRentabiliteBrute() / b.maison.getRentabiliteBrute();

			var voisinA = 1,
				voisinB = 1;
			for (var g in groups) {
				if (groups[g].group.isVoisin(a.maison.groupe)) {
					voisinA++;
				}
				if (groups[g].group.isVoisin(b.maison.groupe)) {
					voisinB++;
				}
			}
			var critere3 = voisinA / voisinB;
			/* Quatrieme critere : fait une ligne avec un autre groupe du joueur */
			var critere4 = 1;
			if(_self.strategie!=null){
				var interetA = _self.strategie.interetPropriete(a.maison);
				var interetB = _self.strategie.interetPropriete(b.maison);
				if(interetA!=interetB){
					critere4 = (interetA)?0.5:2;
				}
			}
			var critere5 = 1;
			if(a.maison.isTerrain()!=b.maison.isTerrain()){
				critere5 = (a.maison.isTerrain())?0.5:4;
			}
			var criteres = critere1 * critere2 * critere3 * critere4 * critere5;
			return criteres - 1;
		});
		return interests;

	}

	/* Renvoie la liste des terrains peu important (gare, compagnie et terrains hypotheques) */
	/* On integre dans les resultats le nombre d'elements par groupe */
	this.findUnterestsProprietes = function () {
		var proprietes = [];
		var nbByGroups = [];
		for (var m in this.maisons) {
			var maison = this.maisons[m];
			if (!maison.isTerrain()) {
				proprietes.push(maison);
				if (nbByGroups[maison.groupe.nom] == null) {
					nbByGroups[maison.groupe.nom] = 1;
				} else {
					nbByGroups[maison.groupe.nom]++;
				}
			}
		}

		return {
			proprietes: proprietes,
			nbByGroups: nbByGroups
		};
	}

	/**
	 * Renvoie les terrains constructibles qui n'interessent (pas en groupe)
	 * @param interestTerrains : terrains qui interessent, on filtre
	 */
	this.findOthersProperties = function (interestTerrains) {
      var terrains = [];
		var mapInterests = [];
		for (var i in interestTerrains) {
			mapInterests[interestTerrains[i].maison.color] = 1;
		}
      for (var f in this.maisons) {
			var maison = this.maisons[f];
         if (maison.isTerrain() && !maison.isGroupee() && mapInterests[maison.color] == null) {
				terrains.push(maison);
			}
		}
		return terrains;
	}

	/* Renvoie les groupes constructibles avec les proprietes de chaque */
	this.findMaisonsConstructibles = function () {
		var mc = new Array();
		var colorsOK = new Array();
		var colorsKO = new Array();

		// Si une maison est hypothequee, on ne peut plus construire sur le groupe
		for (var i = 0; i < this.maisons.length; i++) {
			var m = this.maisons[i];
			if (m.isTerrain() == true) {
				if (colorsOK[m.color] == true) {
					mc.push(m); // on a la couleur, on ajoute
				} else {
					if (colorsKO[m.color] == null) {
						// On recherche si on a toutes les couleurs
						var ok = true;
						// On cherche une propriete qui n'appartient pas au joueur
						for (var f in m.groupe.fiches) {
							var fiche = m.groupe.fiches[f];
							if (fiche.isTerrain() == true &&
								(fiche.joueurPossede == null || !fiche.joueurPossede.equals(this) || fiche.statutHypotheque == true)) {
								ok = false;
							}
						}
						if (!ok) {
							colorsKO[m.color] = true;
						} else {
							colorsOK[m.color] = true;
							mc[mc.length] = m;
						}
					}
				}
			}
		}
		return mc;
	}
}

/* Gere les joueurs : creation, changement... */
var GestionJoueur = {
	colorsJoueurs : ["#383C89", "#A6193E", "#C58F01", "#086B3D", "#B9B29B","#663300"],
	imgJoueurs : [],
	joueurs:[],
	joueurCourant:null,
	getJoueurCourant:function(){
		return this.joueurCourant;
	},
   // renvoi le nombre de joueur dans la partie
	getNb:function(){
      return this.joueurs.reduce(function(somme,j){return somme+=!j.defaite?1:0;},0);
		//return this.joueurs.length;
	},
	createAndLoad:function(isRobot,i,nom,data){
		var joueur = this.create(isRobot,i,nom);
		joueur.load(data);
		return joueur;
	},
	create:function(isRobot, i, nom){
		var id = 'joueur' + i;			
		var color = this.colorsJoueurs[i];
		var img = this.imgJoueurs[i];
		var argent = InitMonopoly.plateau.infos.argentJoueurDepart
		var joueur = isRobot ? new JoueurOrdinateur(i, nom, color,argent) : joueur = new Joueur(i, nom, color,argent);
		var div = $('<hr/><div id=\"' + id + '\"><div class="joueur-bloc"><span class="joueur-name">' + joueur.nom + '</span> : <span class="compte-banque"></span> ' + CURRENCY + '<span class="info-joueur" title="Info joueur" data-idjoueur="' + i + '"><img src="img/info-user2.png" style="cursor:pointer;width:24px;float:right"/></span></div></div>');
		$('.panneau_joueur').append(div);
		
		joueur.setDiv($('div[id="' + id + '"]'));
		joueur.setPion(color,img);
		// On defini la couleurs
		$('#' + id + ' > div.joueur-bloc').css('backgroundImage', 'linear-gradient(to right,white 50%,' + color + ')');
		$.trigger('monopoly.newPlayer', {
			joueur: joueur
		});
		this.joueurs.push(joueur);
		return joueur;    
	},
	getById:function(id){
		var numero = parseInt(id);
		for (var joueur in this.joueurs) {
			if (this.joueurs[joueur].numero == numero) {
				return this.joueurs[joueur];
			}
		}
		return null;
	},
	/* @param idInitialJoueur : si present, joueur qui debute */
	change:function(idInitialJoueur){
		if(idInitialJoueur!=null){
			var joueur = this.getById(idInitialJoueur);
			if(joueur!=null){
				return this._select(joueur);
			}
		}
		// Si un echange est en cours, on ne change pas de joueur
		if (GestionEchange.running) {
			return;
		}
		// Joueur bloque, on le debloque avant de continuer
		var joueur = null;
		try {
			joueur = this.next();
		} catch (gagnant) {
          	this._showVainqueur(gagnant);
			return gagnant;
		}
		if (joueur == null) {
			return null;
		}
		if(!GestionDes.isDouble()){
			GestionDes.resetDouble();
		}
		this._select(joueur);
		return null;
	},
	_showVainqueur:function(gagnant){
		$.trigger('monopoly.victoire',{joueur:gagnant});
		// On affiche les resultats complets
		var perdants = this.joueurs.filter(function(j){return j.defaite;});
		perdants.sort(function(a,b){
			if(a.tourDefaite == b.tourDefaite){
				return b.numero - a.numero;
			}
			return b.tourDefaite - a.tourDefaite;
		});			
		var message = "Le joueur " + gagnant.nom + " a gagné en " + this._formatTempsJeu(globalStats.heureDebut) + ".<br/>";
		message+="1 - " + gagnant.nom + "<br/>";
		
		for(var i = 0 ; i < perdants.length ; i++){
			message+= (i+2) + " - " + perdants[i].nom + "<br/>";
		}
		var score = this._calculateScore(gagnant);
		InfoMessage.create(this.joueurCourant,"Fin de partie : " + score + " Points", "green", message, null, null, true);
		//console.log("stats terrains",writePositions(stats.positions));
	},
	/* Calcule un score de victoire */
	/* Prend en compte l'argent, le nombre de terrains, le nombre de constructions, le nombre de tours des joueurs adverses */
	/* On pondere par rapport au nombre de joueur (plus il est grand, plus le nombre de maison a de l'importance) */
	_calculateScore:function(joueur){
		var statsJoueur = joueur.getStats();
		var critere1 = statsJoueur.argent/10000;
		var critere2 = (joueur.maisons.length*this.joueurs.length)/4;	// < 1
		var critere3 = statsJoueur.hotel/12 + statsJoueur.maison/32;	// < 2
		var critere4 = statsJoueur.tour * this.joueurs.length;		// ~5 * nbJoueurs
		var critere5 = 1;												// ~5 * nbJoueurs
		this.joueurs.forEach(function(j){
			critere5+=(!j.equals(joueur))?j.pion.stats.tour:0;
		});
		var score = (critere4 - critere5) * critere1 * critere2 * critere3;
		return Math.round(score);
	},
	_formatTempsJeu:function(beginTime){
		var time = Math.round((new Date().getTime() - beginTime)/1000);
		if(time < 60){
			return sec + " sec";
		}
		var sec = time%60;
		time = Math.round(time/60);
		return time + " min et " + sec + " sec";
	},
	_select:function(joueur){
		$('.action-joueur').removeAttr('disabled').removeClass('disabled');
		if(VARIANTES.echangeApresVente && GestionFiche.isFreeFiches()){
			$('#idEchangeTerrains').attr('disabled','disabled').addClass('disabled');
		}
		if (!joueur.equals(this.joueurCourant)) {
			$('.joueurCourant').removeClass('joueurCourant');
			if(this.joueurCourant!=null){
				this.joueurCourant.pion.pion.setSelected(false);
			}
		}

		this.joueurCourant = joueur;
		this.joueurCourant.pion.pion.setSelected(true);
		joueur.select();
	
	},
	getWinner:function() {
		var defaites = 0;
		var gagnantProbable;
		for (var index in this.joueurs) {
			if (this.joueurs[index].defaite === true) {
				defaites++;
			} else {
				gagnantProbable = this.joueurs[index];
			}
		}
		if (defaites == this.joueurs.length - 1) {
			return gagnantProbable;
		}
		return null;
	},
	next:function(){
		if (this.joueurCourant == null) {
			return this.joueurs[0];
		}
		// On verifie s'il y a encore des joueurs "vivants"
		if (this.joueurCourant.bloque) {
			return null;
		}
		var gagnant = this.getWinner();
		if (gagnant != null) {
			// On a un vainqueur
			throw gagnant;
		}
		var joueur = this.joueurCourant;
		/* Changement de joueur */
		if(!GestionDes.continuePlayer() && !GestionDes.isSpecificAction()){
			var pos = 0;
			joueur = this.joueurs[(joueur.numero + 1) % (this.joueurs.length)];
			while (joueur.defaite == true & pos++ < this.joueurs.length) {
				joueur = this.joueurs[(joueur.numero + 1) % (this.joueurs.length)];
			}
			// On incremente le nb de tours
			if (joueur.numero < this.joueurCourant.numero) {
				globalStats.nbTours++;
			}
		}
        if(GestionDes.isSpecificAction()){
			GestionDes.doSpecificAction();
			// On ne laisse pas le joueur jouer, on enchaine l'action
			return null;
        }
		return joueur;
	},
	/* @param element : sera represente par "this" dans la methode callback */
	forEach:function(callback,element){
		this.joueurs.forEach(callback,element);
	}
}