// TODO : outil pour regler les dettes, moteur pour achat maison pour ordinateur, limites maison 32 hotel 12, strategie smart sur stats maisons les plus visites

  var DEBUG = true;
  /* Jets des dés */
  var des1;
  var des2;
  var nbDouble = 0;
  
  /* Liste des cases et des cartes */
  var fiches = new Array();
  var cartesChance = new Array();
  var cartesCaisseCommunaute = new Array();
  var parcGratuit = null;
  var currentFiche = null;

  /* Liste des joueurs */
  var joueurs = new Array();
  var joueurCourant = null;
  var colorsJoueurs = ["#383C89", "#A6193E", "#C58F01", "#086B3D", "#B9B29B"];
  
  var des1Cube;
  var des2Cube;
  
  var CURRENCY = "F.";

  /* Dimensions */
  var largeur = 65;
  var hauteur = 100;
  var total = (largeur * 9) / 2;
  var centre = 400;
  var bordure = 20;
  var largeurPion = (largeur - 5) / 3;


	// Parametrage des titres
	var titles = {};

  function createMessage(titre, background, message, call, param) {
      $('#message').prev().css("background-color", background);
      $('#message').dialog('option', 'title', titre);
      $('#message').empty();
      $('#message').append(message);
      var button = {
          "Ok": function () {
              call(param);
              $('#message').dialog('close');
          }
      };
      if (call != null) {
          $('#message').dialog('option', 'buttons', button);
      }
      $('#message').dialog('open');
      return button;
  }


  function getNextPos(etat, position) {
      position++;
      if (position == 10) {
          etat = (etat + 1) % 4;
          position = 0;
      }
      return {
          "position": position,
          "etat": etat
      };
  }

  var ETAT_LIBRE = 0;
  var ETAT_ACHETE = 1;

  function ParcGratuit(id) {
      this.montant = null;

      this.case = new CaseSpeciale(0, "Parc Gratuit");
  Drawer.add(this.case);

  this.setMontant = function (montant) {
      this.montant = montant;
      $('#idMontantParc > span').text(this.montant);
  }

  this.payer = function (montant) {
      this.setMontant(this.montant + montant);
  }

  this.action = function () {
      return createMessage("Parc gratuit", "lightblue", "Vous gagnez " + this.montant + " " + CURRENCY, function (param) {
          param.joueur.gagner(param.montant);
          parcGratuit.setMontant(0);
          changeJoueur();
      }, {
          joueur: joueurCourant,
          montant: this.montant
      });
  }

  this.setMontant(0);

  }

  /* Objet qui gere le comportement (rapport a l'argent). Integre la prise de risque (position du jour) */
  /* @risque : prise de risque entre 0 et 1 */

  function Comportement(risque) {
      this.risque = risque;
      this.probaDes = [0, 2.77, 5.55, 8.33, 11.1, 13.8, 16.7, 13.8, 11.1, 8.33, 5.55, 2.77];

	  /* Indique le risque global a depenser cette somme pour le joueur */
	  /* Se base sur 3 informations : 
	  1 : le montant a depenser par rapport a l'argent disponible.
	  2 : le risque de tomber prochainement sur un loyer eleve 
	  3 : le cout du plus fort loyer du plateau 
		  Plus le risque est grand, plus il est important
	  */	  
	  this.getRisqueTotal = function(joueur,cout){
	  	var risque1 = this.calculMargeMontant(joueur,cout);
	  	var risque2 = this.calculMargeMontant(joueur,cout);	// = 0 si aucun risque par la suite
	  	
	  	return risque1 * (risque2/100 + 1);
	  }

	  /* Calcule la marge d'achat par rapport au montant et le pondere par rapport a la prise de risque */
      this.calculMargeMontant = function (joueur, cout) {
      	  var marge = cout / joueur.montant;	// inferieur a 1
		  return marge / this.risque;
      }

      /* Se base sur les prochaines a risque qui arrive, renvoi un pourcentage */
      this.calculRisque = function (joueur) {
          // On calcul le risque de tomber sur une case cher.
          // On considere un risque quand on est au dessus de risque * montant d'amande)
          var position = joueur.pion.position;
          var etat = joueur.pion.etat;
          var stats = 0;
          for (var i = 1; i <= 12; i++) {
              var pos = getNextPos(etat, position);
              etat = pos.etat;
              position = pos.position;
              var fiche = fiches[etat + "-" + position];
              if (fiche != null && fiche.getLoyer != null && (fiche.getLoyer() > (joueur.montant * this.risque))) {
                  stats += this.probaDes[i - 1];
              }
          }
          return stats;
      }

      // calcul le loyer le plus fort du joueur (et n'appartenant pas au joueur). Permet de connaitre la treso max que le joueur peut posseder sur lui
      this.plusFortLoyer = function (joueur) {
          var max = 0;
          for (var id in fiches) {
          	var f = fiches[id];
              if (f.getLoyer != null && f.joueurPossede != null && !joueur.equals(f.joueurPossede) && f.getLoyer() > max) {
                  max = f.getLoyer();
              }
          }
          return max;
      }
  }

  function CheapComportement() {
      Comportement.call(this, 0.25);
  }

  function MediumComportement() {
      Comportement.call(this, 0.5);
  }

  function HardComportement() {
      Comportement.call(this, 0.8);
  }

  /* Objet qui gere la strategie. IL y a différentes implémentations */
  /* @colors : liste des groupes qui interessent le joueur */
  /* @param agressif : plus il est eleve, plus le joueur fait de l'antijeu (achat des terrains recherches par les adversaires) */

  function Strategie(colors, agressif,name) {
      this.groups = colors;
      this.agressif = agressif;
	 this.interetGare = ((Math.random()*1000)%3==0)?true:false;	// Interet pour gare
	 this.name = name;

	 this.groups.contains = function(value){
	   for (var val in this) {
		if (this[val] == value) {
		  return true;
		}
	   }
	   return false;
	 }
	 
	 /* Renvoie des stats sur les proprietes concernees par cette strategie : nombre de propriete, nombre de libre... */
	 this.getStatsProprietes = function(){
	   var stats={color:{total:0,libre:0,achete:0,pourcent:0},all:{total:0,libre:0,achete:0,pourcent:0}};
	   for (var id in fiches) {
		if (fiches[id].statut!=null) {
		  stats.all.total++;
		  if(fiches[id].statut == ETAT_LIBRE){
		    stats.all.libre++;
		  }
		  else{
		    stats.all.achete++;
		  }
		  if (this.groups.contains(fiches[id].color)) {
		    stats.color.total++;
		    if(fiches[id].statut == ETAT_LIBRE){
			 stats.color.libre++;
		    }
		    else{
			 stats.color.achete++;
		    }	
		  }	
		}
	   }
	   stats.color.pourcent = (stats.color.libre/stats.color.total)*100;
	   stats.all.pourcent = (stats.all.libre/stats.all.total)*100;
	   return stats;
	 }
	 
      this.interetGlobal = function (propriete, joueur) {
          var i1 = this.interetPropriete(propriete);
          var i2 = this.statutGroup(propriete, joueur);
          if (i1 == false && i2 == 0) {
              return 0;
          }
          if (i1 == false && i2 == 2) {
              return this.agressif;
          }
          if (i1 == true && i2 == 3) {
              return 4;
          }

          return 1;
      }

      /* Calcul l'interet pour la maison (a partir des groupes interessant) */
      this.interetPropriete = function (propriete) {
          for (var color in this.groups) {
              if (this.groups[color] == propriete.color || (propriete.type == 'gare' && this.interetGare)) {
                  return true;
              }
          }
          return false;
      }

      /* Renvoie le statut de la famille : 
		  0 : toutes les proprietes sont libres
		  1 : s'il reste des libres apres celle ci
		  2 : si toutes appartiennent a une même personne sauf celle-ci
		  3 : si toutes appartiennent sauf celle-ci
		  4 : autres */
      // Prendre en compte si j'ai la famille, que c'est la derniere carte. Il faut passer les autres options de risques, prix. Il faut absolument acheter
      this.statutGroup = function (propriete, joueur) {
          var nbTotal = 0;
          var nbLibre = 0;
          var dernierJoueur = null;
          var nbEquals = 0;
          var nbPossede = 0;
		  for(var id in fiches){
		  	var fiche = fiches[id];
		  	if (fiche.color!=null && fiche.color == propriete.color) {
                  nbTotal++;
                  if (fiche.statut == ETAT_LIBRE) {
                      nbLibre++;
                  } else {
                      if (fiche.joueurPossede.equals(joueur)) {
                          nbPossede++;
                      }
                      else{
		                  if (dernierJoueur == null || fiche.joueurPossede.equals(dernierJoueur)) {
		                      nbEquals++;
		                  }
		              }                      
                      dernierJoueur = fiche.joueurPossede;
                  }
              }
		  }          
          if (nbLibre == nbTotal) {
              return 0;
          }
         
          if (nbLibre == 1 && nbEquals == nbTotal - 1) {
              return 2;
          }
          if (nbLibre == 1 && nbPossede == nbTotal - 1) {
              return 3;
          }
      	  if (nbLibre > 0) {
              return 1;
          }
          return 4;
      }
  }

  /* Achete en prioriete les terrains les moins chers : bleu marine-812B5C, bleu clair-119AEB, violet-73316F et orange-D16E2D */

  function CheapStrategie() {
      Strategie.call(this, ["#812B5C", "#119AEB", "#73316F", "#D16E2D"], 0, "cheap");
  }
  
  var strategies = [CheapStrategie,MediumStrategie,HardStrategie];	// liste des strategies

  /* Achete en prioriete les terrains les moins chers : violet-73316F, orange-D16E2D, rouge-D32C19 et jaune-E6E018 */

  function MediumStrategie() {
      Strategie.call(this, ["#73316F", "#D16E2D", "#D32C19", "#E6E018"], 1, "medium");
  }

  /* Achete en prioriete les terrains les moins chers : rouge-D32C19, jaune-E6E018, vert-11862E et bleu foncé-132450 */

  function HardStrategie() {
      Strategie.call(this, ["#D32C19", "#E6E018", "#11862E", "#132450"], 2, "hard");
  }

  /* Achete tout */

  function CrazyStrategie() {
      Strategie.call(this, ["#812B5C", "#119AEB", "#73316F", "#D16E2D", "#D32C19", "#E6E018", "#11862E", "#132450"], 4, "crazy");
  }

  /* Joueur ordinateur */
  /* Il faut, a la creation, definir le style de jeu : prudent (achat des deux première lignes), agressif (achète tout)
	 mode fric (achète les plus chers).*/

  function JoueurOrdinateur(numero, nom) {
      Joueur.call(this, numero, nom);
      this.initialName = nom;
      /* Stratégie : définit le comportement pour l'achat des maisons */
      this.strategie = null;
      /* Comportement : définit le rapport à l'argent. Inclu la prise de risque */
      this.comportement = null;

	 /* Determine les caracteristiques d'un ordinateur*/
	 this.init = function(){
	   // On choisit la strategie au hasard
	   switch (Math.round(Math.random()*1000)%3) {
		case 0 : this.strategie = new CheapStrategie();break;
		case 1 : this.strategie = new MediumStrategie();break;
		case 2 : this.strategie = new HardStrategie();break;
	   }
	   switch (Math.round(Math.random()*1000)%3) {
		case 0 : this.comportement = new CheapComportement();break;
		case 1 : this.comportement = new MediumComportement();break;
		case 2 : this.comportement = new HardComportement();break;
	   }
	   this.updateName(true);
	 }
	 
	 this.updateName = function(noUpdate){
	   this.nom= this.initialName + " " + this.strategie.name;
	   if(noUpdate!=true){
	   	$('.joueur_name','#joueur' + this.numero).text(this.nom);
	   }
	 }
	 
      // Fonction appelee lorsque le joueur a la main
      this.joue = function () {
		// On reevalue a intervalle regulier la strategie
		this.changeStrategie();
          // on lance les dés
          lancerAnimerDes();
      }
	 /* Reevalue la strategie. Se base sur plusieurs parametres :
	 * Si peu de propriete ont ete achetees (<3) alors que 60% des terrains qui l'interessent ont ete vendu et qu'aucune famille n'est completable, on reevalue.
	 * 
	 *
	 *
	 */
	 this.changeStrategie = function(){
	   var stats = this.strategie.getStatsProprietes();
	   if (stats.color.pourcent<40 && this.countInterestProperties()<=2 && this.isFamilyFree()) {
		// On change de strategie. Une nouvelle strategie doit posseder au moins 60% de ces terrains de libre
		for (var i in strategies) {
			var s = new strategies[i]();
			if(s.name!=this.strategie.name){
				var strategieStats = s.getStatsProprietes();
				if(strategieStats.color.pourcent > 60){
					// Nouvelle strategie
					this.strategie = s;
					return;
				}
			}
		}
		// On garde la même si aucune n'est interessante
	   }
	 }
      var current = this;
 
	 /* Compte le nombre de maison de la couleur possede */
	 this.countInterestProperties = function(){
	   var count = 0;
	   for (var i = 0 ; i < this.maisons.length ; i++) {
		if (this.strategie.groups.contains(this.maisons[i].color)) {
		  count++;
		}
	   }
	   return count;
	 }
	 
	 /* Analyse si une famille est en partie possedee et peut etre achetee (autre terrain libre) */
	 this.isFamilyFree = function(){
		// On compte par couleur
		var family = array();
	 	for (var i = 0 ; i < this.maisons.length ; i++) {
			if(family[this.maisons[i].color] == null){
				family[this.maisons[i].color] = 1;
			}
			else{
				family[this.maisons[i].color]++;
			}
	 	}
	 	// On verifie pour chaque couleur si les autres terrains sont libres
	 	for(var color in family){
	 		var fiches = getFichesOfFamily(color);
	 		var isFree = true;
	 		// On boucle sur les fiches et on verifie qu'elles sont soit libre, soit à nous
	 		for(var index in fiches){
	 			if(fiches[index].statut != ETAT_LIBRE && !fiches[index].joueurPossede.equals(this)){
	 				isFree = false;
	 			}
	 		}
	 		if(isFree){return true;}	 
	 	}
	 	return false;
	  }
	 
      // Fonction appelee lorsque les des sont lances et que le pion est place
      this.actionApresDes = function (buttons, propriete) {
          if (buttons == null) {
              return;
          }
          setTimeout(function () {
              if (buttons.Acheter != null && propriete != null) {
                  var interet = current.strategie.interetGlobal(propriete);
			   var comportement = current.comportement.getRisqueTotal(current,propriete.achat);
                  console.log("Strategie : " + interet + " " + comportement);
			   if (interet > comportement) {
				console.log("achete");
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
          }, 1000);
      }

      // decide si achete ou non la maison
      // On se base sur la politique, les fiches obtenues par les autres
      this.gererAchat = function (boutonAchat) {
          boutonAchat.click();
      }
	 
	 this.init();
  }

  /* Represente un joueur */

  function Joueur(numero, nom) {
      this.numero = numero;
      this.nom = nom;
      this.montant = 100000;
      this.maisons = new Array();
      this.enPrison = false;
      this.pion = null;
      this.equals = function (joueur) {
          if (joueur == null) {
              return false;
          }
          return this.numero == joueur.numero;
      }

      // Cherche la position ou placer la nouvelle fiche (tri par couleur)
      this.cherchePlacement = function (maison) {
          for (var i = 0; i < this.maisons.length; i++) {
              if (this.maisons[i].color == maison.color) {
                  return this.maisons[i].input;
              }
          }
      }

      this.joueDes = function (sommeDes) {
          var nextCase = this.pion.deplaceValeursDes(sommeDes);
          this.pion.goto(nextCase.axe, nextCase.pos, doActions);
      }

      // Fonction a ne pas implementer avec un vrai joueur
      this.joue = function () {}

      // Fonction a ne pas implementer avec un vrai joueur
      this.actionApresDes = function (buttons, propriete) {}

      // Achete une propriete
      this.acheteMaison = function (maison, id) {
          if (maison.isLibre()) {
              var m = this.cherchePlacement(maison);
              var input = '<input type=\"button\" id=\"idInputFiche' + id + '\" class=\"ui-corner-all\" style=\"display:block;height:27px;width:280px;color:white;background-color:' + maison.color + ';font-weight:bold\" value=\"' + maison.nom + '\" id=\"fiche_' + id + '\"/>';
              if (m != null) {
                  m.after(input);
              } else {
                  joueurCourant.div.append(input);
              }

              maison.input = $('#idInputFiche' + id);
              maison.input.click(function () {
                  //fiches[id].openFiche();
                  openDetailFiche(fiches[id], $(this));
              });
              this.maisons[this.maisons.length] = maison;
              maison.vendu(this);
              this.payer(maison.achat);
          }
      }

      // Envoi le joueur (et le pion) en prison
      this.goPrison = function () {
          this.enPrison = true;
          this.div.find('div:first').addClass('jail');
          this.nbDouble = 0;
          this.pion.goPrison();
      }

      this.exitPrison = function () {
          this.enPrison = false;
          this.nbDouble = 0;
          this.div.find('div:first').removeClass('jail');
      }

      this.isEnPrison = function () {
          return this.enPrison;
      }
      this.setDiv = function (div) {
          this.div = div;
          this.setArgent(this.montant);
      }

      this.setArgent = function (montant) {
          this.montant = montant;
          this.div.find('.compte-banque').text(montant);
      }

      this.payerParcGratuit = function (montant) {
          this.montant -= montant;
          parcGratuit.payer(montant);
          this.setArgent(this.montant);
      }

      this.setPion = function (color) {
          this.pion = new Pion(color, this);
      }

      this.payer = function (montant) {
          this.montant -= montant;
          this.setArgent(this.montant);
      }
      this.gagner = function (montant) {
          this.montant += montant;
          this.setArgent(this.montant);
      }

      this.getFichePosition = function () {
          return fiches[this.pion.etat + "-" + this.pion.position];
      }

	/* Renvoie la liste des terrains hypothecables : sans construction sur le terrain et ceux de la famille, pas deja hypotheques */
	/* @return : la liste des terrains */
	this.findMaisonsHypothecables = function(){
		var proprietes = [];
		for (var i = 0; i < this.maisons.length; i++) {
			var propriete = this.maisons[i];
			if(propriete.statutHypoteque == false && propriete.nbMaison == 0){
				// Aucune propriete possedee de la couleur ne doit avoir de maison
				var flag = true;
				for (var j = 0; j < this.maisons.length; j++) {
					if(this.maisons[i].color == propriete.nbMaison > 0){flag = false;}
				}
				if(flag){
					proprietes.push(propriete);
				}
			}
		}
		return proprietes;
	}

      this.findMaisonsConstructibles = function () {
          var mc = new Array();
          var colorsOK = new Array();
          var colorsKO = new Array();

          for (var i = 0; i < this.maisons.length; i++) {
              var m = this.maisons[i];
              if (m.constructible == true) {
                  if (colorsOK[m.color] == true) {
                      mc[mc.length] = m; // on a la couleur, on ajoute
                  } else {
                      if (colorsKO[m.color] == null) {
                          // On recherche si on a toutes les couleurs
                          var ok = true;
                          for (var f in fiches) {
                              if (fiches[f].constructible == true && fiches[f].color == m.color && (fiches[f].joueurPossede == null || fiches[f].joueurPossede.numero != this.numero)) {
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

  function Pion(color, joueur) {
      this.etat = 2;
      this.position = 0;
      this.joueur = joueur;
      this.pion = new PionJoueur(color, fiches["2-0"].case.getCenter().x, fiches["2-0"].case .getCenter().y);
      Drawer.addRealTime(this.pion);

      // Ca directement en prison, sans passer par la case depart, en coupant
      this.goPrison = function () {
          this.goDirectToCell(3, 0);
      }

      this.deplaceValeursDes = function (des) {
          var pos = this.position + des;
          var axe = this.etat;
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
          // decalage
          var center = fiches[this.etat + "-" + this.position].
      case .getCenter();
      this.pion.x = center.x;
      this.pion.y = center.y;
      console.log(joueurCourant.numero + " va a " + etat + "-" + pos);
      this.gotoCell(etat, pos, call);
      }

      // Si on passe par la case depart, on prend 20000 Francs
      this.treatCaseDepart = function (etatCible, posCible) {
          if (!this.joueur.isEnPrison() && this.position == 0 && this.etat == 2 && this.position != posCible && this.etatCible != this.etat) {
              this.joueur.gagner(20000);
          }
      }

      this.goDirectToCell = function (etat, pos) {
          // On calcule la fonction affine
          var p1 = fiches[this.etat + "-" + this.position].
      case .getCenter()
      var p2 = fiches[etat + "-" + pos].
      case .getCenter()
      // Si meme colonne, (x constant), on ne fait varier que y
      if (p1.x == p2.x) {
          var y = p1.y;
          var sens = (p1.y > p2.y) ? -1 : 1;
          // On fait varier x et on calcule y. Le pas est 30
          var _self = this;
          var interval = setInterval(function () {
              if ((sens < 0 && _self.pion.y <= p2.y) || (sens > 0 && _self.pion.y >= p2.y)) {
                  _self.etat = etat;
                  _self.position = pos;
                  clearInterval(interval);
                  return;
              }
              _self.pion.y += 30 * ((sens < 0) ? -1 : 1);
          }, 30);
      } else {
          var pente = (p1.y - p2.y) / (p1.x - p2.x);
          var coef = p2.y - pente * p2.x;
          var x = p1.x;
          var sens = (p1.x > p2.x) ? -1 : 1;


          // On fait varier x et on calcule y. Le pas est 30
          var _self = this;
          var interval = setInterval(function () {
              if ((sens < 0 && x <= p2.x) || (sens > 0 && x >= p2.x)) {
                  _self.etat = etat;
                  _self.position = pos;
                  clearInterval(interval);
                  return;
              }
              _self.pion.x = x;
              _self.pion.y = pente * x + coef;
              x += 30 * ((sens < 0) ? -1 : 1);
          }, 30);
      }
      }

      // Se dirige vers une cellule donnee. Se deplace sur la case suivante et relance l'algo
      this.gotoCell = function (etatCible, posCible, callback) {
          // Cas de la fin
          if (this.etat == etatCible && this.position == posCible) {
              // On decale le pion
              var decalage = fiches[this.etat + "-" + this.position].
          case .decalagePion();
          this.pion.x = decalage.x;
          this.pion.y = decalage.y;
          if (callback) {
              callback();
          }
          return;
          }
          var caseFiche = this.toNextCase();
          this.treatCaseDepart(etatCible, posCible);
          var pas = 5;
          var field = "x"; // On varie sur l'axe x
          if (this.pion.x == caseFiche.x) {
              field = "y"; // On varie sur l'axe y
          }
          var _self = this;
          var distance = Math.abs(caseFiche[field] - this.pion[field]);
          var sens = (caseFiche[field] > this.pion[field]) ? 1 : -1;
          var interval = setInterval(function () {
              if (distance > 0) {
                  _self.pion[field] += pas * sens;
                  distance -= pas;
              } else {
                  // Traitement fini
                  _self.pion.y = caseFiche.y;
                  _self.pion.x = caseFiche.x;
                  clearInterval(interval);
                  _self.gotoCell(etatCible, posCible, callback);
              }
          }, 30);
      }

      this.toNextCase = function () {
          this.position++;
          if (this.position >= 10) {
              this.etat = (this.etat + 1) % 4;
              this.position = 0;
          }
          return fiches[this.etat + "-" + this.position].
      case .getCenter();
      }
  }

  function CarteActionSpeciale(titre, actionSpeciale, etat, pos) {
      this.titre = titre;
      this.actionSpeciale = actionSpeciale;

      this.
  case = new CaseSpeciale(etat, titre);
  Drawer.add(this.
  case);

  this.action = function () {
      this.actionSpeciale();
      changeJoueur();
  }
  }

  function CarteSpeciale(titre, montant, etat, pos, img) {
      this.case = new Case(pos, etat, null, titre, CURRENCY + " " + montant, img);
  Drawer.add(this.
  case);
  this.action = function () {
      return createMessage(titre, "lightblue", "Vous devez payer la somme de " + montant + " " + CURRENCY, function (param) {
          param.joueur.payerParcGratuit(param.montant);
          changeJoueur();
      }, {
          joueur: joueurCourant,
          montant: montant
      });
  }
  }

  function PayerCarte(montant) {
      this.montant = montant;
      this.action = function () {
          joueurCourant.payerParcGratuit(this.montant);
      }
  }

  function GagnerCarte(montant) {
      this.montant = montant;
      this.action = function () {
          joueurCourant.gagner(this.montant);
      }
  }

  function CarteChance(libelle, actionCC) {
      this.action = function () {
          return createMessage(titles.chance, "lightblue", libelle, function (param) {
              actionCC.action();
              changeJoueur();
          }, {});
      }
  }

  function CarteCaisseDeCommunaute(libelle, actionCC) {
      this.action = function () {
          return createMessage(titles.communaute, "pink", libelle, function (param) {
              actionCC.action();
              changeJoueur();
          }, {});
      }
  }

  function Chance(etat, pos) {
      this.
  case = new Case(pos, etat, null, titles.chance, null, {
      src: "interrogation.png",
      width: 50,
      height: 60
  });
  Drawer.add(this.
  case);
  this.action = function () {
      var c = cartesChance[Math.round((Math.random() * 1000)) % (cartesChance.length)];
      return c.action();
  }
  }

  function CaisseDeCommunaute(etat, pos) {
      this.
  case = new Case(pos, etat, null, titles.communaute, null, {
      src: "banque.png",
      width: 50,
      height: 50
  });
  Drawer.add(this.
  case);
  this.action = function () {
      var c = cartesCaisseCommunaute[Math.round((Math.random() * 1000)) % (cartesCaisseCommunaute.length)];
      return c.action();
  }
  }

   // Gere les dessins
  var Drawer = {
      components: new Array(),
      firstComponents: new Array(),
      height: 0,
      width: 0,
      interval: null,
      intervalRT: null,
      canvas: null,
      canvasRT: null, //Canvas de temps reel
      // ajoute un composant. On indique le canvas sur lequel il s'affiche
      add: function (component, first) {
          component.getId = function () {
              return Drawer.canvas.canvas.id
          };
          if (first) {
              Drawer.firstComponents.push(component);
          } else {
              Drawer.components.push(component);
          }
      },
      addRealTime: function (component) {
          component.getId = function () {
              return Drawer.canvasRT.canvas.id
          };
          Drawer.components.push(component);
      },
      clear: function (canvas) {
          canvas.clearRect(0, 0, this.width, this.height);
      },
      /* Rafraichit un seul canvas */
      refresh: function (canvas) {
          Drawer.clear(canvas);
          for (var i = 0; i < Drawer.firstComponents.length; i++) {
              if (Drawer.firstComponents[i].getId() === canvas.canvas.id) {
                  Drawer.firstComponents[i].draw(canvas);
              }
          }
          for (var i = 0; i < Drawer.components.length; i++) {
              if (Drawer.components[i].getId() === canvas.canvas.id) {
                  Drawer.components[i].draw(canvas);
              }
          }
      },
      // Refraichissement du graphique, time en ms
      setFrequency: function (time, canvas) {
          if (canvas.canvas.id == "canvas") {
              if (Drawer.interval != null) {
                  clearInterval(Drawer.interval);
              }
              Drawer.interval = setInterval(function () {
                  Drawer.refresh(canvas);
              }, time);
          }
          if (canvas.canvas.id == "canvas_rt") {
              if (Drawer.intervalRT != null) {
                  clearInterval(Drawer.intervalRT);
              }
              Drawer.intervalRT = setInterval(function () {
                  Drawer.refresh(canvas);
              }, time);
          }
      },
      init: function (width, height) {
          this.width = width;
          this.height = height;
          this.canvas = document.getElementById("canvas").getContext("2d");
          this.canvasRT = document.getElementById("canvas_rt").getContext("2d");
          this.canvas.strokeStyle = '#AA0000';
          this.canvasRT.strokeStyle = '#AA0000';
		 // On ne recharge pas le plateau, il n'est chargee qu'une seule fois (ou rechargement a la main)
          this.refresh(this.canvas);
		//this.setFrequency(2000, this.canvas);
          this.setFrequency(50, this.canvasRT);
          return this;
      }
  };


  /* @param size : font-size */
  /* @param specificWidth : largeur specifique (plutôt que la largeur habituelle, largeur */

  function writeText(text, x, y, rotate, canvas, size, specificWidth) {
      var width = specificWidth || largeur;
      canvas.font = ((size != null) ? size : "7") + "pt Times news roman";
      // Mesure la longueur du mot
      var mots = [text];
      if (canvas.measureText(text).width > width - 5) {
          // On split les mots intelligement (on regroupe)
          var splitMots = text.split(" ");
          var pos = 0;
          for (var i = 0; i < splitMots.length; i++) {
              if (pos > 0 && (canvas.measureText(mots[pos - 1]).width + canvas.measureText(splitMots[i]).width) < width - 5) {
                  // on concatene
                  mots[pos - 1] = mots[pos - 1] + " " + splitMots[i];
              } else {
                  mots[pos++] = splitMots[i];
              }
          }
      }
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(rotate);
      var pas = 12;
      for (var i = 0; i < mots.length; i++) {
          var lng = (width - canvas.measureText(mots[i]).width) / 2;
          canvas.strokeText(mots[i], lng, i * pas);
      }

      canvas.font = "6pt Times news roman";
      canvas.restore();
  }
  /* Fournit des methodes de dessins */
  var DrawerHelper = {
      drawImage: function (canvas, img, x, y, width, height, rotate) {
          canvas.save();
          canvas.translate(x, y);
          canvas.rotate(rotate);
          canvas.drawImage(img, 0, 0, width, height);
          canvas.restore();
      },
      writeText: function (text, x, y, rotate, canvas, size, specificWidth) {
          var width = specificWidth || largeur;
          canvas.font = ((size != null) ? size : "7") + "pt Times news roman";
          // Mesure la longueur du mot
          var mots = [text];
          if (canvas.measureText(text).width > width - 5) {
              // On split les mots intelligement (on regroupe)
              var splitMots = text.split(" ");
              var pos = 0;
              for (var i = 0; i < splitMots.length; i++) {
                  if (pos > 0 && (canvas.measureText(mots[pos - 1]).width + canvas.measureText(splitMots[i]).width) < width - 5) {
                      // on concatene
                      mots[pos - 1] = mots[pos - 1] + " " + splitMots[i];
                  } else {
                      mots[pos++] = splitMots[i];
                  }
              }
          }
          canvas.save();
          canvas.translate(x, y);
          canvas.rotate(rotate);
          var pas = 12;
          for (var i = 0; i < mots.length; i++) {
              var lng = (width - canvas.measureText(mots[i]).width) / 2;
              canvas.strokeText(mots[i], lng, i * pas);
          }
          canvas.font = "6pt Times news roman";
          canvas.restore();
      }
  }

      function drawImage(canvas, img, x, y, width, height, rotate) {
          canvas.save();
          canvas.translate(x, y);
          canvas.rotate(rotate);
          canvas.drawImage(img, 0, 0, width, height);
          canvas.restore();
      }

      function Component() {
          this.draw = function (canvas) {
              console.log("Not implemented");
          }
      }

      function SimpleRect(x, y, height, width, color) {
          Component.apply();
          this.data = {
              x: x,
              y: y,
              width: width,
              height: height
          };

          this.draw = function (canvas) {
              canvas.fillStyle = color;
              canvas.fillRect(this.data.x, this.data.y, this.data.width, this.data.height);
          }
      }

  

   // Represente un pion d'un joueur
  function PionJoueur(color, x, y) {
      Component.apply(this);
      this.x = x;
      this.y = y;
      this.color = color;
      this.largeur = largeurPion; // Largeur du pion
      this.draw = function (canvas) {
          canvas.fillStyle = this.color;
          canvas.beginPath();
          canvas.arc(this.x, this.y, this.largeur / 2, 0, 2 * Math.PI);
          canvas.fill();
      }
  }

  function Des(x, y, width, value, color) {
      this.value = value;
      this.coin = 15;
      this.width = width - 2 * this.coin;
      this.setValue = function (value, color) {
          this.value = value;
          this.color = color || '#000000';
      }
      this.draw = function (canvas) {
          // Structure du des
          canvas.strokeStyle = '#000000';
          canvas.fillStyle = '#000000';
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
          if (this.value == null) {
              return;
          }
          if (this.value % 2 == 1) {
              this.drawPoint(canvas, x + width / 2, y + width / 2, width / 5, this.color);
          }
          if (this.value != 1) {
              this.drawPoint(canvas, x + width * 0.25, y + width * 0.75, width / 5, this.color);
              this.drawPoint(canvas, x + width * 0.75, y + width * 0.25, width / 5, this.color);
          }
          if (this.value >= 4) {
              this.drawPoint(canvas, x + width * 0.75, y + width * 0.75, width / 5, this.color);
              this.drawPoint(canvas, x + width * 0.25, y + width * 0.25, width / 5, this.color);
          }
          if (this.value == 6) {
              this.drawPoint(canvas, x + width * 0.75, y + width * 0.5, width / 5, this.color);
              this.drawPoint(canvas, x + width * 0.25, y + width * 0.5, width / 5, this.color);
          }

      }
      // Dessine un point
      this.drawPoint = function (canvas, x, y, width, color) {
          canvas.strokeStyle = color || '#000000';
          canvas.fillStyle = color || '#000000';
          canvas.beginPath();
          canvas.arc(x, y, width / 2, 0, 2 * Math.PI);
          canvas.fill();
      }
  }

  function CaseSpeciale(axe, titre) {
      Case.call(this, 0, axe, null, titre);
      this.titre = titre;
      this.data = {};
      this.init = function () {
          if (axe % 2 == 1) { // E et 0
              // height et width inverse
              if (axe == 1) {
                  this.data.x = centre + total;
                  this.data.y = centre + -4.5 * largeur - hauteur;
              } else {
                  this.data.x = centre - total - hauteur;
                  this.data.y = centre + 4.5 * largeur;
              }
          } else { // N et S
              if (axe == 2) {
                  this.data.y = centre + total;
                  this.data.x = centre + 4.5 * largeur;
              } else {
                  this.data.y = centre - total - hauteur;
                  this.data.x = centre - 4.5 * largeur - hauteur;
              }
          }
          this.data.height = this.data.width = hauteur;
      }
      this.getCenter = function () {
          return {
              x: this.data.x + this.data.height / 2,
              y: this.data.y + this.data.height / 2
          };
      }
      this.draw = function (canvas) {
          canvas.strokeStyle = '#000000';
          canvas.strokeRect(this.data.x, this.data.y, this.data.width, this.data.height);
          writeText(this.titre, this.data.x, this.data.y + hauteur / 2, 0, canvas, 9, this.data.width);
      }


      this.init();
  }


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
      this.init = function () {
          this.imgMaison.src = "maison.png";
          this.imgHotel.src = "hotel.png";
          if (axe % 2 == 1) { // E et 0
              // height et width inverse
              this.data.height = largeur;
              this.data.width = hauteur;
              if (axe == 1) {
                  this.data.x = centre + total;
                  this.data.y = centre + (pos - 5.5) * largeur;
              } else {
                  this.data.x = centre - total - hauteur;
                  this.data.y = centre + (4.5 - pos) * largeur;
              }
          } else { // N et S
              this.data.height = hauteur;
              this.data.width = largeur;
              if (axe == 2) {
                  this.data.y = centre + total;
                  this.data.x = centre + (4.5 - pos) * largeur;
              } else {
                  this.data.y = centre - total - hauteur;
                  this.data.x = centre + (pos - 5.5) * largeur;
              }
          }
          if (img != null) {
              var image = new Image();
              image.src = img.src;
              image.height = img.height;
              image.width = img.width;
              this.data.image = image;
          }
      }

      /* Recupere les coordonnees du centre de la case */
      this.getCenter = function () {
          return {
              x: this.data.x + this.data.width / 2,
              y: this.data.y + this.data.height / 2
          };
      }

      this.draw = function (canvas) {
          canvas.strokeStyle = '#000000';
          canvas.strokeRect(this.data.x, this.data.y, this.data.width, this.data.height);
          if (color != null) {
              canvas.fillStyle = color;
              switch (axe) {
              case 0:
                  canvas.fillRect(this.data.x, this.data.y + hauteur - bordure, this.data.width, bordure);
                  break
              case 1:
                  canvas.fillRect(this.data.x, this.data.y, bordure, largeur);
                  break
              case 2:
                  canvas.fillRect(this.data.x, this.data.y, this.data.width, bordure);
                  break;
              case 3:
                  canvas.fillRect(this.data.x + hauteur - bordure, this.data.y, bordure, largeur);
                  break
              }
          }
          if (title != null) {
              var mots = [title];
              var dec = 10 + ((color != null) ? bordure : 0); // Uniquement si couleur
              switch (axe) {
              case 0:
                  writeText(title, this.data.x + largeur, this.data.y + hauteur - dec, Math.PI, canvas);
                  break
              case 1:
                  writeText(title, this.data.x + dec, this.data.y + largeur, -Math.PI / 2, canvas);
                  break
              case 2:
                  writeText(title, this.data.x, this.data.y + dec, 0, canvas);
                  break;
              case 3:
                  writeText(title, this.data.x + hauteur - dec, this.data.y, Math.PI / 2, canvas);;
                  break

              }
          }
          if (prix != null) {
              var dec = 5
              switch (axe) {
              case 0:
                  writeText(prix, this.data.x + largeur, this.data.y + dec, Math.PI, canvas);
                  break
              case 1:
                  writeText(prix, this.data.x + hauteur - dec, this.data.y + largeur, -Math.PI / 2, canvas);
                  break
              case 2:
                  writeText(prix, this.data.x, this.data.y + hauteur - dec, 0, canvas);
                  break;
              case 3:
                  writeText(prix, this.data.x + dec, this.data.y, Math.PI / 2, canvas);
                  break;
              }
          }
          if (this.data.image != null) {
              var rotate = (Math.PI / 2) * ((this.axe + 2) % 4);
              var lng = (largeur - this.data.image.width) / 2;
              var dec = 10 + ((color != null) ? bordure : 10) + ((title != null) ? 10 : 0);
              switch (axe) {
              case 0:
                  drawImage(canvas, this.data.image, this.data.x + largeur - lng, this.data.y + hauteur - dec, this.data.image.width, this.data.image.height, rotate);
                  break
              case 1:
                  drawImage(canvas, this.data.image, this.data.x + dec, this.data.y + largeur - lng, this.data.image.width, this.data.image.height, rotate);
                  break
              case 2:
                  drawImage(canvas, this.data.image, this.data.x + lng, this.data.y + dec, this.data.image.width, this.data.image.height, rotate);
                  break;
              case 3:
                  drawImage(canvas, this.data.image, this.data.x + hauteur - dec, this.data.y + lng, this.data.image.width, this.data.image.height, rotate);
                  break;
              }
          }
          // Cas des maisons
          if (this.nbMaison <= 4) {
              // On ecrit de droite a gauche dans le cartouche
              canvas.fillStyle = '#00FF00';
              for (var i = 0; i < this.nbMaison; i++) {
                  switch (axe) {
                  case 0:
                      drawImage(canvas, this.imgMaison, this.data.x + largeur - 15 * (i) - 3, this.data.y + hauteur - 2, 15, 15, -Math.PI);
                      break
                  case 1:
                      drawImage(canvas, this.imgMaison, this.data.x + 3, this.data.y + largeur - 2 - 15 * i, 15, 15, -Math.PI / 2);
                      break
                  case 2:
                      drawImage(canvas, this.imgMaison, this.data.x + 3 + 15 * i, this.data.y + 2, 15, 15, 0);
                      break;
                  case 3:
                      drawImage(canvas, this.imgMaison, this.data.x + hauteur - 3, this.data.y + 2 + 15 * i, 15, 15, Math.PI / 2);
                      break;
                  }
              }
          } else {
              // Cas de l'hotel, 5 maisons
              var pad = (largeur - 18) / 2;
              switch (axe) {
              case 0:
                  drawImage(canvas, this.imgHotel, this.data.x + largeur - pad, this.data.y + hauteur, 18, 18, -Math.PI);
                  break
              case 1:
                  drawImage(canvas, this.imgHotel, this.data.x, this.data.y + largeur - pad, 18, 18, -Math.PI / 2);
                  break
              case 2:
                  drawImage(canvas, this.imgHotel, this.data.x + pad, this.data.y, 18, 18, 0);
                  break;
              case 3:
                  drawImage(canvas, this.imgHotel, this.data.x + hauteur, this.data.y + pad, 18, 18, Math.PI / 2);
                  break;
              }
          }
      }
      // Nombre de joueur sur la case
      this.getNbJoueurs = function () {
          var count = 0;
          for (var i = 0; i < joueurs.length; i++) {
              if (joueurs[i].pion.etat == this.axe && joueurs[i].pion.position == this.pos) {
                  count++;
              }
          }
          return count;
      }
      // Retourne le decalage d'un pion sur la case
      /* @param inverse : decalage inverse (remise en place) */
      this.decalagePion = function () {
          var dec = 20 + ((color != null) ? bordure : 0) + largeurPion / 2;
          var center = this.getCenter();
          center.x += 5;
          var pas = {
              x: largeurPion,
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

	function getFichesOfFamily(color){
		var family = array();
		for(var fiche in fiches){
			if(fiches[fiche].statut!=null && fiches[fiche].color == color){
				family.push(fiches[fiche]);
			}
		}
		return family;
	}

  function Fiche(etat, pos, colors, nom, achat, loyers, prixMaison, img) {
      this.statut = ETAT_LIBRE;
      this.joueurPossede = null;
      this.nom = nom;
      this.color = colors[0];
      this.secondColor = (colors.length == 2) ? colors[1] : colors[0];
      this.achat = achat;
      this.hypotheque = achat / 2;
      this.statutHypoteque=false;
      this.loyer = loyers;
      this.loyerHotel = (loyers!=null && loyers.length == 6)?loyers[5]:0;
      this.prixMaison = prixMaison;
      this.fiche = $('#fiche');
      this.nbMaison = 0; // Nombre de maison construite sur le terrain par le proprietaire
      this.hotel = false; // Si un hotel est present
      this.maisons = new Array();
      this.constructible = true;
      this.etat = etat;
      this.pos = pos;
      var current = this;
      this.id = etat+"-"+pos;

      this.case = new Case(pos, etat, this.color, this.nom, CURRENCY + " " + achat, img);
  Drawer.add(this. case);

  this.vendu = function (joueur) {
      this.statut = ETAT_ACHETE;
      this.joueurPossede = joueur;
  }
  this.isLibre = function () {
      return this.statut == ETAT_LIBRE;
  }

  /* Modifie le nombre de maison sur le terrain */
  this.setNbMaison = function (nb) {
      this.nbMaison = nb;
      this.
  case .nbMaison = nb;
  }

  this.action = function () {
      this.fiche.dialog('option', 'title', nom);
      // si on est chez soit, on affiche pas
      if (this.joueurPossede != null && this.joueurPossede.numero == joueurCourant.numero) {
          return this.chezSoi();
      }
      if (this.joueurPossede != null) { // on doit payer un loyer
          return this.payerLoyer();
      }

      return this.openFiche();
  }

  this.chezSoi = function () {
      return createMessage("Vous êtes " + this.nom, this.color, "Vous êtes chez vous", changeJoueur)
  }

  this.getLoyer = function () {
      if (this.hotel == true) {
          return this.loyerHotel;
      }
      if (this.nbMaison == 0 && this.isGroupee()) {
          return this.loyer[0] * 2;
      }
      return this.loyer[this.nbMaison];
  }

  this.payerLoyer = function () {
      return createMessage("Vous êtes " + this.nom, this.color, "Vous êtes chez " + this.joueurPossede.nom + " vous devez payez la somme de " + this.getLoyer() + " " + CURRENCY, function (param) {
          param.joueurPaye.payer(param.loyer);
          param.joueurLoyer.gagner(param.loyer);
          changeJoueur();
      }, {
          loyer: this.getLoyer(),
          joueurPaye: joueurCourant,
          joueurLoyer: this.joueurPossede
      });
  }

  this.noArgent = function () {
      construireMaisons(true);
  }

   // Ouvre la fiche d'une propriété
  this.openFiche = function () {
      var buttons = this.getButtons();
      this.fiche.dialog('option', 'buttons', buttons);
      loadFiche(this);
      this.fiche.dialog('open');
      return buttons;
  }

  this.getButtons = function () {
      if (this.statut == ETAT_LIBRE) {
          if (joueurCourant.montant < this.achat) {
              return {
                  "Pas assez d'argent": function () {
                      current.fiche.dialog('close');
                  }
              };
          } else {
              return {
                  "Acheter": function () {
                      var id = joueurCourant.pion.etat + "-" + joueurCourant.pion.position;
                      joueurCourant.acheteMaison(current, id);
                      current.fiche.dialog('close');
                  },
                  "Refuser": function () {
                      current.fiche.dialog('close');
                  }
              };
          }
      } else {
          return {
              "Fermer": function () {
                  current.fiche.dialog('close');
              }
          };
      }
  }


  this.isGroupee = function () {
      if (this.joueurPossede == null) {
          return false;
      }
      var l = this.joueurPossede.findMaisonsConstructibles();
      for (var i = 0; i < l.length; i++) {
          if (l[i].color == this.color) {
              return true;
          }
      }
      return false;
  }
  }

  function FicheGare(etat, pos, color, nom, achat, loyers) {
      Fiche.call(this, etat, pos, color, nom, achat, loyers, null, {
          src: "train.png",
          width: 40,
          height: 50
      });
      this.type = "gare";
      this.constructible = false;
      this.getLoyer = function () {
          if (this.joueurPossede != null) {
              var nb = -1;
              for (var i = 0; i < this.joueurPossede.maisons.length; i++) {
                  if (this.joueurPossede.maisons[i].type == "gare") {
                      nb++;
                  }
              }
              return this.loyer[nb];
          }
          return 0;
      }
  }

  function FicheCompagnie(etat, pos, color, nom, achat, loyers) {
      Fiche.call(this, etat, pos, color, nom, achat, loyers);
      this.fiche = $('#ficheCompagnie');
      this.type = "compagnie";
      this.constructible = false;

      this.getLoyer = function () {
          var loyer = des1 + des2;
          if (this.joueurPossede != null) {
              var nb = -1;
              for (var i = 0; i < this.joueurPossede.maisons.length; i++) {
                  if (this.joueurPossede.maisons[i].type == "compagnie") {
                      nb++;
                  }
              }
              return this.loyer[nb] * loyer;
          }
          return this.loyer[0] * loyer;
      }
  }


   // Pour la recuperation d'argent, on passe par une version allégée du construireMaisons

  function construireMaisons(modeBanqueroute) {
      var maisons = joueurCourant.findMaisonsConstructibles();
      maisons.sort(function (a, b) {
          if (a.color == b.color) return 0;
          if (a.color > b.color) return 1;
          if (a.color < b.color) return -1;
      });
      $('#achatMaisons').empty();
      var m = "<table>";
      for (var i = 0; i < maisons.length; i++) {

          m += '<tr id=\"idAchatMaison-' + maisons[i].color + i + '\"><td style="font-weight:bold;color:' + maisons[i].color + '">' + maisons[i].nom;
          if (maisons[i].hotel == true) {
              m += " : 1 hotel" + '</td><td></td>';
          } else {
              var id = maisons[i].etat + "-" + maisons[i].pos;
              m += " : </td><td><select id=\"id_input_" + id + "\">";
              for (var j = 0; j <= ((modeBanqueroute != null) ? maisons[i].nbMaison : 5); j++) {
                  m += "<option value=\"" + j + "\" " + ((maisons[i].nbMaison == j) ? "selected" : "") + ">" + j + "</option>"
              };
              m += " </select> maison(s) (<span id=\"montant_" + id + "\"></span> " + CURRENCY +")</td>";
          }
          m += '</tr>';
      }
      m += "<tr><td>TOTAL</td><td><span id=\"idTotalDepenses\"></span> " + CURRENCY + "</td></tr>";
      m += "</table>";
      $('#achatMaisons').append(m);
      $('#achatMaisons').find('select[id^=id_input_]').change(function () {
          var id = this.id.replace("id_input_", "");
          // Au dessus du nombre, achat, en dessous, on vend la moitié
          var montant = 0;
          if ($(this).val() > fiches[id].nbMaison) {
              // on achete
              montant = ($(this).val() - fiches[id].nbMaison) * fiches[id].prixMaison;
          }
          if ($(this).val() < fiches[id].nbMaison) {
              // on vend
              montant = ($(this).val() - fiches[id].nbMaison) * fiches[id].prixMaison / 2;
          }
          $('#montant_' + id).text(montant);
          var total = 0;
          $('#achatMaisons').find('span[id^=montant_]').each(function () {
              if ($(this).text() != "") total += parseInt($(this).text());
          });
          $('#idTotalDepenses').text(total);
      });

      $('#achatMaisons').dialog('option', 'buttons', {
          "Annuler": function () {
              $('#achatMaisons').dialog('close');
          },
          "Effectuer": function () {
              var equilibre = true;
              // on verifie que c'est equilibre (pas plus de une maison d'ecart
              var colors = new Array();
              $('#achatMaisons').find('select[id^=id_input_]').each(function () {
                  var id = this.id.replace("id_input_", "");
                  var c = fiches[id].color;
                  if (colors[c] == null) { // pas encore traitee
                      colors[c] = 1;
                      var max = -1;
                      var min = -1;
                      $('#achatMaisons').find('tr[id*=' + c + ']').each(function () {
                          var val = $(this).find('select[id^=id_input_]').val();
                          if (max == -1 && min == -1) {
                              max = val;
                              min = val;
                          } else {
                              if (val > max) {
                                  max = val;
                              }
                              if (val < min) {
                                  min = val;
                              }
                          }
                      });

                      if (max - min > 1) {
                          equilibre = false;
                      }
                  }
              });

              if (equilibre == false) {
                  alert("Il faut équilibrer la répartition des maisons sur les couleurs");
                  return;
              }

              $('#achatMaisons').dialog('close');
              if (parseInt($('#idTotalDepenses').text()) > joueurCourant.montant) {
                  alert("Pas possible, plus assez d'argent");
                  return;
              }

              var currentEtat = joueurCourant.pion.etat;
              var currentPosition = joueurCourant.pion.position;
              var currentArgent = joueurCourant.montant - parseInt($('#idTotalDepenses').text());
              $('#achatMaisons').find('select[id^=id_input_]').each(function () {
                  var id = this.id.replace("id_input_", "");
                  // Au dessus du nombre, achat, en dessous, on vend la moitié
                  fiches[id].setNbMaison($(this).val());
              });
              joueurCourant.setArgent(currentArgent);
          }
      });
      $('#achatMaisons').dialog('open');
  }

   // Cree le comportement lorsque le joueur arrive sur la carte

  function doActions() {
      var fiche = fiches[joueurCourant.pion.etat + "-" + joueurCourant.pion.position];
      if (fiche == null) {
          changeJoueur();
          return;
      }
      var buttons = fiche.action();	// Recupere les actions jouables en tombant sur cette case 
      // une fois l'action cree, le joueur doit faire une action
      joueurCourant.actionApresDes(buttons, fiche);
  }


  function changeJoueur() {
      $('#idLancerDes').removeAttr('disabled');
      if (des1 != des2) {
          joueurCourant = joueurs[(joueurCourant.numero + 1) % (joueurs.length)];
          selectJoueurCourant();
          nbDouble = 0;
      } else {
          joueurCourant.joue(); // double, rejoue
      }
  }


  function closeFiche() {
      changeJoueur();
  }

  function rand() {
      return Math.round((Math.random() * 1000)) % 6 + 1;
  }

  /* Lance et anime les des */

  function lancerAnimerDes() {
      // Fait tourner les des 8 fois
      // On desactive le bouton pour eviter double click
      $('#idLancerDes').attr('disabled', 'disabled');
      var nb = 8;
      var interval = setInterval(function () {
          if (nb-- < 0) {
              clearInterval(interval);
              return lancerDes();
          }
          des1Cube.setValue(rand(), '#999999');
          des2Cube.setValue(rand(), '#999999');
      }, 100);
  }

  function lancerDes() {
      $('#informationsCentrale').html("");
      des1 = rand();
      des2 = rand();
      des1Cube.setValue(des1);
      des2Cube.setValue(des2);

      if (joueurCourant.enPrison == true) {
          if (des1 == des2) {
              var buttons = createMessage("Libéré de prison", "lightblue", "Vous êtes libérés de prison grâce à un double", function () {
			 joueurCourant.exitPrison();	 
		    }, {});
              joueurCourant.actionApresDes(buttons, null);
          } else {
              if (joueurCourant.nbDouble == 2) {
                  var buttons = createMessage("Libéré de prison", "lightblue", "Vous êtes libérés de prison, mais vous devez payer " + CURRENCY + " 5.000 !", function () {
                      joueurCourant.payerParcGratuit(5000);
                      joueurCourant.exitPrison();
                      joueurCourant.joueDes(des1 + des2);
                  }, {});
                  joueurCourant.actionApresDes(buttons, null);
                  return;
              } else {
                  joueurCourant.nbDouble++;
                  var buttons = createMessage("Tour " + joueurCourant.nbDouble, "red", "Vous restez en prison, vous n'avez pas fait de double.", function () {
                      changeJoueur();
                  }, {});
                  joueurCourant.actionApresDes(buttons, null);
                  return;
              }
          }
      } else {
          if (des1 == des2) {
              if (nbDouble >= 2) {
                  // prison
                  $('#informationsCentrale').text("3eme double, allez en PRISON");
                  joueurCourant.goPrison();
                  changeJoueur();
                  return;
              } else {
                  nbDouble++;
              }
          }
      }
      joueurCourant.joueDes(des1 + des2);
      if (des1 == des2) {
          $('#informationsCentrale').html("Relancez");
      }
  }


  function init(plateau) {
	 initDetailFiche();
      initFiches();
      initPlateau(plateau,initJoueurs);
      initDes();
      
     
  }

	function initJoueurs(){
	 var nb = prompt("Nombre de joueurs ?");
      for (var i = 0; i < nb; i++) {
          var id = 'joueur' + i;
          var joueur = null;
          if (i == 0) {
              joueur = new Joueur(i, "Joueur " + (i + 1));
          } else {
              joueur = new JoueurOrdinateur(i, "Joueur " + (i + 1));
          }
          joueurs[i] = joueur;
          $('#informations').append('<div id=\"' + id + '\"><div><span class="joueur_name">' + joueur.nom + '</span> : <span class="compte-banque"></span> ' + CURRENCY + '</div></div><hr/>');
          joueur.setDiv($('#' + id));
          joueur.setPion(colorsJoueurs[i]);
      }
      joueurCourant = joueurs[0];
      selectJoueurCourant();

      $('#message').dialog({
          autoOpen: false
      });
      $('#message').prev().css("background", "url()");

      // panneau de création
      $('#achatMaisons').dialog({
          autoOpen: false,
          title: "Achat de maisons / hôtels",
          width: 500,
          height: 300
      });

	}

   // Initialise les des

  function initDes() {
      des1Cube = new Des(200, 200, 50);
      des2Cube = new Des(260, 200, 50);
      Drawer.addRealTime(des1Cube);
      Drawer.addRealTime(des2Cube);
  }

   // Initialise le plateau
  function initPlateau(plateau,callback) {
      Drawer.add(new SimpleRect(0, 0, 800, 800, '#A7E9DB'), true);
      // On charge le plateau
      $.ajax({
      	url:plateau,
      	dataType:'json',
      	success:function(data){
		     parcGratuit = new ParcGratuit();
		     CURRENCY = data.currency;
		     titles = data.titles;
			$(data.fiches).each(function(){
				var fiche = null;
				switch(this.type){
					case "propriete":
						fiche = new Fiche(this.axe, this.pos, this.colors, this.nom, this.prix, this.loyers, this.prixMaison);
						break;
					case "compagnie":
						fiche = new FicheCompagnie(this.axe, this.pos, this.colors,this.nom, this.prix, this.loyers);
						break;
					case "gare":
						fiche = new FicheGare(this.axe, this.pos, this.colors, this.nom,this.prix, this.loyers);
						break;
					case "chance":
						fiche = new Chance(this.axe, this.pos);
						break;
					case "communaute":
						fiche = new CaisseDeCommunaute(this.axe, this.pos);
						break;
					case "taxe" : 
						fiche = new CarteSpeciale(this.nom, this.prix, this.axe, this.pos);
						break;
					case "prison" : 
						fiche = new CarteActionSpeciale(this.nom, function () {
				          joueurCourant.goPrison();
				        }, this.axe, this.pos);
				        break;
				    case "special" : 
						fiche = new CarteActionSpeciale(this.nom, function () {}, this.axe, this.pos);
						break;
				    case "parc" : 
						fiche = parcGratuit;
						break;
				    case "special-depart" : 
						fiche = new CarteActionSpeciale(this.nom, function () {
							joueurCourant.gagner(40000)
				  		}, this.axe, this.pos);
				  		break;				  						
				}
				fiches[this.axe + "-" + this.pos] = fiche;
			});
			// On charge les cartes chances et caisse de communaute
			$(data.chance.cartes).each(function(){
			 cartesChance.push(new CarteChance(this.nom, (this.montant>0)?new GagnerCarte(this.montant):new PayerCarte(this.montant)));
			})
			$(data.communaute.cartes).each(function(){
			 cartesCaisseCommunaute.push(new CarteCaisseDeCommunaute(this.nom, (this.montant>0)?new GagnerCarte(this.montant):new PayerCarte(this.montant)));
			});
     		Drawer.init(800, 800);
     		callback();
      	},
      	error:function(){
      		alert("Le plateau " + plateau + " n'existe pas");
      		return;
      	}
      });
	 
  }

  function initDetailFiche() {
      var div = $('#fiche').clone();
      div.attr('id', 'idDetailFiche').hide();
      $('body').append(div);
  }

  

  function openDetailFiche(fiche, input) {
      if (currentFiche != null && currentFiche.etat == fiche.etat && currentFiche.pos == fiche.pos) {
          if ($('#idDetailFiche:visible').length == 0) {
              $('#idDetailFiche').slideDown();
          } else {
              $('#idDetailFiche').slideUp();
          }
          return;
      }
      if (currentFiche != null && (currentFiche.etat != fiche.etat || currentFiche.pos != fiche.pos)) {
          currentFiche = null;
          $('#idDetailFiche').slideUp(300, function () {
              openDetailFiche(fiche, input);
          });
          return;
      }
      $('#idDetailFiche').width(280);
      loadDetailFiche(fiche);
      input.after($('#idDetailFiche'));
      $('#idDetailFiche').slideDown();
      currentFiche = fiche;
  }

  function closeDetailFiche() {
      $('#idDetailFiche').slideUp();
  }


  function loadFiche(fiche) {
      loadGenericFiche(fiche, $('#fiche'), 'FFFFFF');
      fiche.fiche.prev().css("background-color", fiche.color);      
  }

  function loadDetailFiche(fiche) {
      loadGenericFiche(fiche, $('#idDetailFiche'), fiche.secondColor);
  }

  function loadGenericFiche(fiche, div, color) {
      $('td[name^="loyer"]', div).each(function () {
          $(this).text(fiche.loyer[parseInt($(this).attr('name').substring(5))]);
      });
      $('td[name]:not([name^="loyer"]),span[name]:not([name^="loyer"])', div).each(function () {
          $(this).html(fiche[$(this).attr('name')]);
      });
      $(div).css('backgroundColor', color);
      $('#loyer0', div).text((fiche.isGroupee() == true) ? parseInt(fiche.loyer[0]) * 2 : fiche.loyer[0]);

      $('tr', div).removeClass("nbMaisons");
      $('infos-group', div).removeClass("nbMaisons");
      $('#loyer' + fiche.nbMaison, div).parent().addClass("nbMaisons");
      if (fiche.nbMaison == 0 && fiche.isGroupee() == true) { // possede la serie
          $('.infos-group', div).addClass("nbMaisons");
      }
      if(fiche.type == 'gare'){
      	$('.maison',div).hide();
      }
      else{
      	$('.maison',div).show();      
      }
  }

  function initFiches() {
      $('#fiche').dialog({
          autoOpen: false,
          title: "Fiche",
          width: 280,
          height: 400,
          modal: true,
          resizable: false,
          close: function () {
              closeFiche();
          }
      });
      $('#fiche').prev().css("background", "url()");

      $('#ficheCompagnie').dialog({
          autoOpen: false,
          title: "Fiche",
          width: 280,
          height: 350,
          modal: true,
          resizable: false,
          close: function () {
              closeFiche();
          }
      });
      $('#ficheCompagnie').prev().css("background", "url()");
  }

  function selectJoueurCourant() {
      selectJoueur(joueurCourant);
  }

  function selectJoueur(joueur) {
      $('#informations > div > div').removeClass('joueurCourant');
      joueur.div.find('div:first').addClass('joueurCourant');
      if (!joueur.enPrison) {
          joueur.nbDouble = 0;
      }
      joueur.joue();
  }
