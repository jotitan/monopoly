import {GestionFiche,ETAT_ACHETE,ETAT_LIBRE} from "../display/case_jeu.js";
import {Pion} from "./pion.js";
import {GestionDes} from "./dices.js";
import {doActions,VARIANTES} from "../monopoly.js";
import {GestionJoueur} from "../gestion_joueurs.js";
import {FicheDisplayer} from "../display/displayers.js";
import {InfoMessage} from "../display/message.js";

// Represente houses of a player
class Maisons{
	constructor(joueur,maisons=[]){
		this.joueur = joueur;
		this.maisons = [];
		maisons.forEach(m=>this.add(m));
	}
	add(maison){
		maison.joueurPossede = this.joueur;
		maison.statut = ETAT_ACHETE;
		this.maisons.push(maison);
	}
	remove(maison){
		let index = this.maisons.findIndex(m=>m.equals(maison));
		if(index != -1) {
			maison.statut = ETAT_LIBRE;
			maison.joueurPossede = null;
			this.maisons.splice(index, 1);
		}
	}
	/**
	 * Renvoie la liste des groupes presque complet (un terrain manquant) pour lequel le terrain est encore libre
	 */
	getGroupesPossibles() {
		let groups = new Set();
		this.maisons
			.filter(m=>!m.isGroupee())
			.filter(maison=>
				// calcule les terrains libre de la meme couleur : si 1 libre=>ok, si adversaire ou libre 1, ko
				maison.groupe.fiches
					.filter(f=>!this.joueur.equals(f.joueurPossede))
					.reduce((libre,f)=>libre + (f.statut === ETAT_LIBRE ? 1:10),0)
				=== 1
			).forEach(m=>groups.add(m.color));
		return Array.from(groups);
	}

	/** Renvoie les maisons du joueur par groupe avec des details*/
	getMaisonsGrouped() {
		var groups = [];
		this.maisons.forEach(maison=>{
			if (maison.groupe == null) {
				if (groups["others"] === undefined) {
					groups["others"] = {
						groupe: 'Autres',
						color: 'black',
						terrains: [maison]
					};
				} else {
					groups["others"].terrains.push(maison);
				}
			} else {
				if (groups[maison.groupe.nom] === undefined) {
					groups[maison.groupe.nom] = {
						groupe: maison.groupe.nom,
						color: maison.groupe.color,
						terrains: [maison]
					};
				} else {
					groups[maison.groupe.nom].terrains.push(maison);
				}
			}
		});
		return groups;
	}
	/** Renvoie la liste des maisons regroupées par groupe. getMaisonsGrouped est plus complete */
	findMaisonsByGroup(){
		let groups = [];
		this.maisons.forEach(m=>{
			if(groups[m.groupe.nom] ==null) {
				groups[m.groupe.nom] = [];
			}
			groups[m.groupe.nom].push(m);
		});
		return groups;
	}

	/** Renvoie la liste des terrains hypothecables : sans construction sur le terrain et ceux de la famille, pas deja hypotheques */
	findMaisonsHypothecables() {
		return this.maisons
			.filter(propriete=>
				propriete.statutHypotheque === false
				&& propriete.nbMaison === 0
				&& !this.maisons.some(m=>m.color === propriete.color && m.nbMaison > 0));
	}

	/** Renvoie la liste des maisons hypothequees */
	findMaisonsHypothequees() {
		return this.maisons.filter(m=>m.statutHypotheque)
	}

	/** Renvoie la liste des groupes constructibles du joueur
	 * @returns {Array}
	 */
	findConstructiblesGroupes() {
		var colorsKO = [];
		var groups = [];
		this.maisons
			.filter(m=>m.isTerrain() === true && m.groupe != null)
			.forEach(m=>{
				if (colorsKO[m.color] === undefined) {
					// On recherche si on a toutes les proprietes du groupe
					let infos = m.groupe.getInfos(this.joueur);
					// Possede le groupe
					if (infos.free === 0 && infos.adversaire === 0 && infos.hypotheque === 0) {
						groups[m.color] = {
							color: m.color,
							group: m.groupe,
							proprietes: m.groupe.fiches
						};
					} else {
						colorsKO[m.color] = true;
					}
				}
			});
		return groups;
	}
	/* Cherche les terrains qui interesse chez les adversaires */
	/* Les terrains sont tries par interet.
	 * Les criteres : la rentabilite, le nombre de terrain a acheter (1 ou 2), le fait de faire une ligne avec un groupe possede */
	/* @param joueur : ne recherche que les proprietes de ce joueur */
	/* @param excludes : terrain exclu, a ne pas renvoyer (celui vise par l'echange) */
	findOthersInterestProprietes(joueur,exclude,strategie) {
		let interests = [];
		let treatGroups = []; // groupes traites
		// On parcourt les terrains du joueur. Pour chaque, on etudie le groupe
		this.maisons.forEach(maison=>{
			if (treatGroups[maison.groupe.color] === undefined) {
				// Structure : free,joueur,adversaire,nbAdversaires
				let infos = maison.groupe.getInfos(this.joueur);
				// Si tous les terrains vendus et un terrain a l'adversaire ou deux terrains a deux adversaires differents, on peut echanger
				if (infos.free === 0 && (infos.adversaire === 1 || infos.nbAdversaires > 1)) {
					infos.maisons
						.filter(m=>(joueur === undefined || joueur.equals(m.joueurPossede)) && (exclude == null || !exclude.groupe.equals(m.groupe)))
						.filter(()=>!(exclude && maison.groupe.color === exclude.groupe.color))
						// On ajoute chaque maison avec le nombre a acheter pour terminer le groupe
						.forEach(m=>interests.push({maison: m,nb: infos.maisons.length}));
				}
				treatGroups[maison.groupe.color] = true;
			}
		});

		let groups = this.findConstructiblesGroupes();

		// On trie la liste selon rapport (argent de 3 maison / achat terrain + 3 maisons), le nombre de terrains a acheter
		// on rajoute le fait que ca appartient a la strategie et que c'est constructible
		interests.sort( (a, b)=> this._computeScoreInterest(a,b,groups,strategie));
		return interests;

	}
	_computeScoreInterest(a,b,groups,strategie){
		let critere1 = a.nb / b.nb;
		/* Second critere : rentabilite du terrain */
		let critere2 = a.maison.getRentabiliteBrute() / b.maison.getRentabiliteBrute();

		let voisinA = 1,
			voisinB = 1;

		for (let g in groups) {
			if (groups[g].group.isVoisin(a.maison.groupe)) {
				voisinA++;
			}
			if (groups[g].group.isVoisin(b.maison.groupe)) {
				voisinB++;
			}
		}
		let critere3 = voisinA / voisinB;
		/* Quatrieme critere : fait une ligne avec un autre groupe du joueur */
		let critere4 = 1;
		if(strategie!=null){
			let interetA = strategie.interetPropriete(a.maison);
			let interetB = strategie.interetPropriete(b.maison);
			if(interetA!==interetB){
				critere4 = interetA?0.5:2;
			}
		}
		let critere5 = 1;
		if(a.maison.isTerrain()!==b.maison.isTerrain()){
			critere5 = (a.maison.isTerrain())?0.5:4;
		}
		return critere1 * critere2 * critere3 * critere4 * critere5 - 1;
	}
	/* Renvoie la liste des terrains peu important (gare, compagnie et terrains hypotheques) */
	/* On integre dans les resultats le nombre d'elements par groupe */
	findUnterestsProprietes() {
		var nbByGroups = [];
		let proprietes = this.maisons.filter(m=>!m.isTerrain());
		proprietes.forEach(m=>{
			if (nbByGroups[m.groupe.nom] === undefined) {
				nbByGroups[m.groupe.nom] = 1;
			} else {
				nbByGroups[m.groupe.nom]++;
			}
		});
		return {
			proprietes: proprietes,
			nbByGroups: nbByGroups
		};
	}
	/**
	 * Renvoie les terrains constructibles qui n'interessent (pas en groupe)
	 * @param interestTerrains : terrains qui interessent, on filtre
	 */
	findOthersProperties(interestTerrains) {
		var mapInterests = [];
		for (let i in interestTerrains) {
			mapInterests[interestTerrains[i].maison.color] = 1;
		}
		return this.maisons.filter(m=>m.isTerrain() && !m.isGroupee() && mapInterests[m.color] === undefined);
	}
	/** Renvoie les groupes constructibles avec les proprietes de chaque */
	findMaisonsConstructibles() {
		var mc = [];
		var colorsOK = [];
		var colorsKO = [];

		// Si une maison est hypothequee, on ne peut plus construire sur le groupe
		this.maisons
			.filter(m=>m.isTerrain())
			.forEach(m=>{
				if (colorsOK[m.color] === true) {
					mc.push(m); // on a la couleur, on ajoute
				} else {
					if (colorsKO[m.color] === undefined) {
						// On recherche si on a toutes les couleurs et si une propriete qui n'appartient pas au joueur
						let ok = !m.groupe.fiches.some(f=>f.isTerrain() && (!this.joueur.equals(f.joueurPossede) || f.statutHypotheque === true));
						if (!ok) {
							colorsKO[m.color] = true;
						} else {
							colorsOK[m.color] = true;
							mc[mc.length] = m;
						}
					}
				}
			});
		return mc;
	}
	libere(){
		this.maisons.forEach(m=>m.libere());
		this.maisons = [];
	}
}

/* Represente un joueur humain */
class Joueur {
	constructor(numero, nom = '', color,argent,montantDepart=0){
		this.numero = numero;
		this.type = "Local";
		this.id = numero;
		this.nom = nom;
		this.color = color;
		this.montant = argent;
		this.maisons = new Maisons(this);
		this.enPrison = false;
		this.pion = null;
		// Nombre de tour en prison
		this.nbDouble = 0;
		// Indique que le joueur est bloque. Il doit se debloquer pour que le jeu continue
		this.bloque = false;
		this.defaite = false;
		this.tourDefaite = null;
		this.cartesSortiePrison = []; // Cartes sortie de prison
		// Indique que c'est un vrai joueur, pas un robot
		this.canPlay = true;
		this.montantDepart = montantDepart;	// Montant sur la case depart
		this.enableMouseFunction = ()=>{};
	}

	setEnableMouseFunction(fct){
		this.enableMouseFunction = fct;
	}
	equals(joueur) {
		return joueur != null && this.numero === joueur.numero;
	}
	// Renvoie vrai si la place de joueur est disponible
	isSlotFree(){
		return false;
	}
	/* Sauvegarde un joueur */
	save() {
		// On sauvegarde id, nom, color,montant, prison, bloque, defaite, cartes, son type (manuel). Pas besoin des maisons (auto)
		let data = {
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

	load(data) {
		for (let name in data) {
			if (this[name] != null) {
				this[name] = data[name];
			}
		}
		this.setArgent(this.montant);
		this.loadMore(data);
		// Position initiale, aucune action
		this.pion.goDirectToCell(data.axe, data.position);
		// Cas des cartes de prison

		// Cas ou le joueur est mort
		if(this.defaite) {
			$('.joueurCourant', this.div).removeAttr('style').addClass('defaite');
		}
		return this;
	}

	/* Template Method : les enfants peuvent la reimplementer */
	// Indique les choses a sauvegarder en plus
	saveMore() {}

	loadMore(data) {}

	// Utilise la carte sortie de prison
	utiliseCarteSortiePrison() {
		if (this.cartesSortiePrison.length === 0) {
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
	getStats() {
		let statsJ = {
			type:this.type,
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
		for (var index in this.maisons.maisons) {
			var maison = this.maisons.maisons[index];
			statsJ.hotel += maison.hotel === true ? 1 : 0;
			statsJ.maison += parseInt(maison.hotel === false ? maison.nbMaison : 0);
			// Revente des constructions + hypotheque
			statsJ.argentDispo += (maison.statutHypotheque) ? 0 : (((maison.isTerrain()) ? (maison.nbMaison * (maison.prixMaison / 2)) : 0) + maison.achat / 2);
			// Revente uniquement des terrains non groupes
			statsJ.argentDispoHypo += (!maison.isGroupee() && !maison.statutHypotheque) ? maison.achat / 2 : 0; // hypotheque des terrains non groupes
		}
		return statsJ;
	}

	/* Selectionne le joueur */
	select() {
		if (this.div) {
			this.div.find('div:first').addClass('joueurCourant');
		}
		if (!this.enPrison) {
			this.nbDouble = 0;
		}
		this.joue();
	}
	// Notify to network, if necessary
	notifySelect(){}
	notifyDices(dices){}
	// Lance les des
	lancerDes(){
		GestionDes.lancer();
	}
	getPosition() {
		return {
			pos: this.pion.position,
			axe: this.pion.axe
		};
	}

	/* Affiche la demande d'echange d'un joueur */
	traiteRequeteEchange(joueur, terrain, proposition) {
		// On affiche l'interface au joueur
		CommunicationDisplayer.show(joueur, this, terrain, proposition, this);
	}

	/* Affiche la contreproposition du joueur */
	traiteContreProposition(proposition, joueur, terrain) {
		CommunicationDisplayer.showContreProposition(proposition);
	}

	/* On affiche a l'utilisateur l'acceptation de la proposition */
	notifyAcceptProposition(callback) {
		// On affiche l'information
		CommunicationDisplayer.showAccept(callback);
	}

	/* On affiche a l'utilisateur le rejet de la proposition */
	notifyRejectProposition(callback) {
		CommunicationDisplayer.showReject(callback);
	}

	/* Initialise une mise aux encheres */
	/* @param transaction : numero de transaction pour communiquer */
	initEnchere(transaction, terrain) {
		GestionEnchereDisplayer.display(terrain, this);
	}

	/* Met a jour la derniere enchere qui a été faite (pour suivre l'avancement) quand le joueur ne participe plus */
	updateInfoEnchere(montant, lastEncherisseur) {
		GestionEnchereDisplayer.updateInfo(montant, lastEncherisseur, false);
	}

	/* Notifie lorsqu'un joueur quitte les encheres */
	notifyExitEnchere(joueur) {
		GestionEnchereDisplayer.showJoueurExit(joueur);
	}

	updateEnchere(transaction, jeton, montant, lastEncherisseur,isNewEnchere) {
		if(isNewEnchere){
			GestionEnchereDisplayer.clean();
		}
		GestionEnchereDisplayer.updateInfo(montant, lastEncherisseur, true, {
			transaction: transaction,
			jeton: jeton
		});
	}

	endEnchere(montant, joueur) {
		GestionEnchereDisplayer.displayCloseOption(montant, joueur);
	}

	// Cherche la position ou placer la nouvelle fiche (tri par couleur)
	cherchePlacement(maison) {
		for (let i = 0; i < this.maisons.maisons.length; i++) {
			if (this.maisons.maisons[i].color === maison.color) {
				return this.maisons.maisons[i].input;
			}
		}
		return null;
	}

	joueDes(sommeDes) {
		this.moveTo(sommeDes);
	}
	moveTo(nb){
		var nextCase = this.pion.deplaceValeursDes(nb);
		this.joueSurCase(nextCase);
	}

	/* Joueur sur une case donnees */
	joueSurCase(fiche,direct, primeDepart=true){
		this.pion.goto(fiche.axe, fiche.pos, ()=>doActions(this),direct,primeDepart);
	}

	// Fonction a ne pas implementer avec un vrai joueur
	joue() {}

	/* Pour le des rapide, choisi la combinaison de des qu'il souhaite */
	choisiDes(des1,des2,callback){
		if(!callback){return;}

		let options = [
			{title:(des1 + ' + ' + des2),fct:function(){callback(des1+des2);}},
			{title:(des1),fct:function(){callback(des1);}},
			{title:(des2),fct:function(){callback(des2);}}
		];
		var message = 'Quel(s) dé(s) vous choisissez';
		InfoMessage.createGeneric(this,'Vous prenez le bus','green',message,options);
	}
	/* Le joueur se deplace sur la case qu'il souhaite */
	choisiCase(callback){
		InfoMessage.create(this,"Triple dé","green","Choisissez votre case",()=>{
			this.enableMouseFunction(callback);
		});
	}

	// Fonction a ne pas implementer avec un vrai joueur
	actionApresDes(buttons, propriete) {}

	// Fonction a ne pas implementer pour un vrai joueur
	actionAvantDesPrison(buttons) {}

	// Achete une propriete
	/* @param montant : montant a payer si different du prix d'achat (cas des encheres) */
	acheteMaison(maison,montant=maison.achat) {
		// On verifie l'argent
		if (maison === undefined || montant > this.montant) {
			throw "Achat de la maison impossible";
		}
		if (maison.isLibre()) {
			this._drawTitrePropriete(maison);
			maison.vendu(this);
			this.payer(montant);
			this.notifyAcheteMaison(maison,montant);
		}
	}
	// Create an event which notify buy
	notifyAcheteMaison(terrain,montant){}

	/* Refuse l'achat d'une propriete. La banque peut mettre aux encheres le terrain */
	refuseMaison(maison,callback=()=>{}){
		$.trigger('monopoly.visiteMaison',{joueur:GestionJoueur.getJoueurCourant(),maison:maison});
		if(VARIANTES.enchereAchat){
			this._enchereByBanque(maison,callback);
		}else{
			callback();
		}
	}

	_enchereByBanque(maison,callback){
		GestionEnchere.init(maison, maison.achat, true, callback);
	}

	_drawTitrePropriete(maison) {
		var m = this.cherchePlacement(maison);
		var input = '<input type=\"button\" id=\"idInputFiche' + maison.id + '\" class=\"ui-corner-all fiche color_' + maison.color.substring(1) + '\" value=\"' + maison.nom + '\" id=\"fiche_' + maison.id + '\"/>';
		if (m != null) {
			m.after(input);
		} else {
			this.div.append(input);
		}
		maison.input = $('input[id="idInputFiche' + maison.id + '"]');
		if (maison.statutHypotheque === true) {
			maison.input.addClass('hypotheque');
		}
		maison.input.click(function () {
			FicheDisplayer.openDetail(GestionFiche.getById(maison.id), $(this));
		});
	}

	/* Permet de deplacer le terrain sur le joueur lors d'un echange */
	getSwapProperiete(maison) {
		maison.input.remove();
		maison.input = null;
		this._drawTitrePropriete(maison);

		// On supprime l'ancien proprio
		if(maison.joueurPossede){
			maison.joueurPossede.maisons.remove(maison);
		}
		maison.setJoueurPossede(this);
	}

	// Envoi le joueur (et le pion) en prison
	goPrison() {
		this.enPrison = true;
		this.div.addClass('jail');
		this.nbDouble = 0;
		this.pion.goPrison(()=>GestionJoueur.change());
		$.trigger("monopoly.goPrison", {
			joueur: this
		});
	}

	exitPrison(info = {notrigger:false,paye:false,carte:false}) {
		this.enPrison = false;
		this.nbDouble = 0;
		this.div.removeClass('jail');
		if(!info.notrigger) {
			$.trigger("monopoly.exitPrison", {
				joueur: this,
				paye:info.paye,
				carte:info.carte
			});
		}
	}

	isEnPrison() {
		return this.enPrison;
	}

	setDiv(div) {
		this.div = div;
		this.setArgent(this.montant);
	}

	setArgent(montant) {
		if(montant === undefined){
			console.log("error montant")
			throw "error"
		}
		this.montant = montant;
		$('.compte-banque', this.div).text(montant);
	}

	payerParcGratuit(parc,montant, callback=()=>{}) {
		try{
			this.payer(montant, ()=> {
				if (VARIANTES.parcGratuit) {
					parc.payer(montant);
				}
				callback();
			});
		}catch(insolvable){
			callback();
		}
	}

	setPion(color,img,montantDepart) {
		this.pion = new Pion(color, this,img,montantDepart);
	}

	/* Verifie si le joueur peut payer ses dettes */
	isSolvable(montant) {
		return this.getStats().argentDispo >= montant;
	}

	/* Paye la somme demandee. Si les fonds ne sont pas disponibles, l'utilisateur doit d'abord réunir la somme, on le bloque */
	/* @param callback : action a effectuer apres le paiement */
	payer(montant, callback=()=>{}) {
		// On verifie si c'est possible de recuperer les sommes
		if (this.getStats().argentDispo < montant) {
			// Banqueroute, le joueur perd
			this.doDefaite();
			throw "Le joueur " + this.nom + " est insolvable";
		}

		/* Verifie si le joueur peut payer */
		this.notifyPay(montant);
		if (this.montant - montant < 0) {
			this.bloque = true;
			this.resolveProblemeArgent(montant, callback);
		} else {
			this.setArgent(this.montant - montant);
			callback();
		}
	}
	notifyHypotheque(terrain){}
	notifyLeveHypotheque(terrain){}
	notifyPay(montant){}

	/* Paye une somme a un joueur */
	/* Si le joueur ne peut pas payer, une exception est lancee (il a perdu). On recupere le peut d'argent a prendre */
	/* Payer est potentiellement asynchrone (resolve manuel), on indique l'etape suivante en cas de reussite */
	// Attention, en cas de reseau, il faut que le joueur recoive l'argent, meme s'il est remote. L'instruction de gain est envoyé spécifiquement
	payerTo(montant, joueur,callback) {
		let argentDispo = this.getStats().argentDispo;
		try {
			this.payer(montant, () => {
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

	gagner(montant) {
		this.setArgent(this.montant + montant);
	}

	/* Gestion de la defaite */
	doDefaite() {
		// On laisse juste le nom et on supprime le reste, on supprime le pion, on remet les maison a la vente
		// Le banquier peut mettre aux encheres les terrains
		this.maisons.libere();
		$.trigger('refreshPlateau'); // Pour supprimer les terrains
		this.updateMaisonsByGroup();
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
	resolveProblemeArgent(montant, callback) {
		// On ouvre le panneau de resolution en empechant la fermeture
		this.montant -= montant;
		InfoMessage.create(this,"Attention", "red", "Vous n'avez pas les fonds necessaires, il faut trouver de l'argent", ()=> {
			// On attache un evenement a la fermeture
			let onclose = (e)=> {
				if (this.montant < 0) {
					// Message d'erreur pas possible
					InfoMessage.create(this,"Attention", "red", "Impossible, il faut trouver les fond	s avant de fermer");
					e.preventDefault();
				} else {
					this.bloque = false;
					this.setArgent(this.montant);
					callback();
				}
			}
			GestionTerrains.open(true, onclose);
		});
		return true;
	}

	getFichePosition() {
		return GestionFiche.getById(this.pion.axe + "-" + this.pion.position);
	}

	updateMaisonsByGroup(){
		let groups = this.maisons.findMaisonsByGroup();
		let div = $('.count-property',this.div);
		$(".counter-group",div).html(0);
		for(var group in groups){
			let color = group.replace(/ /g,"");
			$(`.counter-group.${color}`,div).html(groups[group].length);
		}
	}

	endTurn(){}
}


// Used only when master play
class NetworkJoueur extends Joueur{
	constructor(numero, nom, color,argent,montantDepart){
		super(numero,nom,color,argent,montantDepart);
	}
	moveTo(nb){
		var nextCase = this.pion.deplaceValeursDes(nb);
		Notifier.moveTo(GestionFiche.buildId(nextCase),this);
		this.joueSurCase(nextCase);
	}
	gagner(montant) {
		this.setArgent(this.montant + montant);
		Notifier.gagner(montant,this);
	}
	notifyPay(montant){
		Notifier.payer(montant,this);
	}
	notifyHypotheque(terrain){
		Notifier.hypotheque(terrain,this);
	}
	notifyLeveHypotheque(terrain){
		Notifier.leveHypotheque(terrain,this);
	}
	notifySelect(){
		Notifier.notifySelect(this);
	}
	notifyAcheteMaison(terrain,montant){
		Notifier.notifyAcheteMaison(terrain,montant,this);
	}
	notifyDices(dices,event){
		Notifier.dices(dices,event,this);
	}
}

let Notifier = {
	askDices(player) {
		$.trigger("event.network", {
			kind: "launchDices",
			player: player.id
		});
	},
	dices(dices, event,player) {
		delete event.joueur;
		let sendEvent = $.extend({
			kind: "dices",
			player: player.id,
			dice1: dices[0],
			dice2: dices[1],
			quickDice: dices[2]
		},event);
		$.trigger("event.network", sendEvent);
	},
	hypotheque(terrain,player) {
		$.trigger("event.network", {
			kind: "hypotheque",
			terrain: terrain.id,
			player:player.id
		});
	},
	leveHypotheque(terrain,player) {
		$.trigger("event.network", {
			kind: "leveHypotheque",
			terrain: terrain.id,
			player:player.id
		});
	},
	move(nb, player) {
		$.trigger("event.network", {
			kind: "move",
			player: player.id,
			nb: nb
		});
	},
	moveTo(to, player) {
		$.trigger("event.network", {
			kind: "moveTo",
			player: player.id,
			to: to
		});
	},
	notifySelect(player) {
		$.trigger("event.network", {
			kind: "change",
			player: player.id
		});
	},
	payer(montant, player) {
		$.trigger("event.network", {
			kind: "tax",
			player: player.id,
			montant: montant
		});
	},
	gagner(montant, player) {
		$.trigger("event.network", {
			kind: "earn",
			player: player.id,
			montant: montant
		});
	},
	notifyAcheteMaison(terrain, montant, player) {
		$.trigger("event.network", {
			kind: "buy",
			player: player.id,
			terrain: terrain.id,
			montant: montant,
		});
	},
	notifyEnd() {
		$.trigger("event.network", {
			kind: "end"
		});
	}
}

export {Joueur,Maisons,Notifier};