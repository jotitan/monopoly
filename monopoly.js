// TODO : outil pour regler les dettes, moteur pour achat maison pour ordinateur, limites maison 32 hotel 12, strategie smart sur stats maisons les plus visites
// Bilan joueurs : nombres proprietes, nombres maisons / hotels, argent, argent dispo (apres hypotheque / vente)

// Defini la methode size. Cette methode evite d'etre enumere dans les boucles
Object.defineProperty(Array.prototype, "size", {
    value: function () {
        var count = 0;
        for (var i in this){
            count++;
        }
        return count;
    },
    writable: false,
    enumerable: false,  
    configurable: false
});
 

  var DEBUG = true;
  /* Jets des des */
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
  var constructions = {maison:32,hotel:12};
  
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

/* Cherche une fiche a partir de l'etat et la position. Info contient pos et etat */
  function getFiche(info) {
    return fiches[info.axe + "-" + info.pos];
  }

	// Parametrage des titres
	var titles = {};

  function createMessage(titre, background, message, call, param) {
      $('#message').prev().css("background-color", background);
      $('#message').dialog('option', 'title', titre);
      $('#message').empty();
      $('#message').append(message);
      var button = {
          "Ok": function () {
              $('#message').dialog('close');
              call(param);              
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

      this.drawing = new CaseSpeciale(0, "Parc Gratuit");
  Drawer.add(this.drawing);

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
	  	var risque2 = this.calculRisque(joueur,joueur.montant);
	  	
	  	return risque1 * (risque2/100 + 1);
	  }


		/* Calcul le budget depensable pour la construction de maison / hotel */
		/* Prendre en compte l'achat potentiel de nouveau terrain. Pour la strategie, on calcule les terrains qui interessent */
		this.getBudget = function(joueur){
		  var assiette = joueur.montant;	// Utilise pour calculer les risques
		  // Si le joueur est une charogne, on utilise l'argent dispo avec les possibles hypotheques (tous les terrains sauf les groupes). 
		  // Utilise uniquement pour le calcul de risque, pas pour l'achat (pour ne pas hypothequer lors de l'achat).
		  if(this.risque > 0.6){
		  	assiette = joueur.getStats().argentDispoHypo;
		  }
		  // On prend le plus fort loyer du plateau
		  var maxLoyer = this.plusFortLoyer(joueur);
		  // On prend l'argent pondere par le risque
		  var risque = this.calculRisque(joueur,assiette);
		  // On pondere le loyer max par le carre du risque afin d'augmenter exponentiellement son importance
		  return Math.round((joueur.montant  - maxLoyer * (1 - this.risque*this.risque)) * (1 - risque/100));
		}

		/* Calcul le terrain du joueur sur lesquels les adversaires peuvent tomber */
		/* @param seuil : seuil a partir duquel on renvoie les maisons */
		this.getNextProprietesVisitees = function(joueur){//,seuil){
		  var maisons = [];
		  for (var idJoueur in joueurs) {
		    var j = joueurs[idJoueur];
		    if (!j.equals(joueur)) {
			 // On parcours toutes les statistiques et on mesure le risque de tomber sur une propriete du joueur
			 var posActuel = j.getPosition();
			 for (var i = 1 ; i <12; i++) {
			   var fiche = getFiche(j.pion.deplaceValeursDes(i));
			   if (fiche.constructible && fiche.joueurPossede!=null && fiche.joueurPossede.equals(joueur)) {
				//maison visitable, on ajoute la maison avec la proba
				if (maisons[fiche.id]!=null) {
				  maisons[fiche.id].proba+=this.probaDes[i]/100;
				}
				else{
				  maisons[fiche.id] = ({proba:this.probaDes[i]/100,maison:fiche});
				}
			   }
			 }
		    }
		  }
		  return maisons;
		  /*var sortMaisons = [];
		  for(var id in maisons){
		 	if(seuil == null|| maisons[id].proba >= seuil){
		 		sortMaisons.push(maisons[id]);
		 	}
		 }
		 sortMaisons.sort(function(a,b){
		 	if(a.proba == b.proba)return 0;
		 	if(a.proba > b.proba)return 1;
		 	return -1;
		 });
		  
		  return sortMaisons;*/
		}
		
		
	  /* Calcule la marge d'achat par rapport au montant et le pondere par rapport a la prise de risque */
      this.calculMargeMontant = function (joueur, cout) {
      	  var marge = cout / joueur.montant;	// inferieur a 1
		  return marge / this.risque;
      }

      /* Se base sur les prochaines cases a risque qui arrive, renvoi un pourcentage */
      this.calculRisque = function (joueur,argent) {
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
              if (fiche != null && fiche.getLoyer != null && fiche.joueurPossede!=null && !fiche.joueurPossede.equals(joueur) && (fiche.getLoyer() > (argent * this.risque))) {
                  stats += this.probaDes[i - 1];
              }
          }
          return stats;
      }

      // calcul le loyer le plus fort du joueur (et n'appartenant pas au joueur). Permet de connaitre la treso max que le joueur peut posseder sur lui
      this.plusFortLoyer = function (joueur) {
          var max = 20000;	// Prix de la taxe de luxe
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

  /* Objet qui gere la strategie. IL y a differentes implementations */
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
		  2 : si toutes appartiennent a une meme personne sauf celle-ci
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

  /* Achete en prioriete les terrains les moins chers : rouge-D32C19, jaune-E6E018, vert-11862E et bleu fonce-132450 */

  function HardStrategie() {
      Strategie.call(this, ["#D32C19", "#E6E018", "#11862E", "#132450"], 2, "hard");
  }

  /* Achete tout */

  function CrazyStrategie() {
      Strategie.call(this, ["#812B5C", "#119AEB", "#73316F", "#D16E2D", "#D32C19", "#E6E018", "#11862E", "#132450"], 4, "crazy");
  }

  /* Joueur ordinateur */
  /* Il faut, a la creation, definir le style de jeu : prudent (achat des deux premiere lignes), agressif (achete tout)
	 mode fric (achete les plus chers).*/

  function JoueurOrdinateur(numero, nom) {
      Joueur.call(this, numero, nom);
      this.initialName = nom;
      /* Strategie : definit le comportement pour l'achat des maisons */
      this.strategie = null;
      /* Comportement : definit le rapport e l'argent. Inclu la prise de risque */
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
		// Construit des maisons / hotels
		this.buildConstructions();
        // on lance les des
        lancerAnimerDes();
      }
      
      /* Fonction doBlocage a developpe permettant de faire du blocage de construction : vente d'un hotel pour limiter l'achat de maison, decision d'acheter un hotel pour bloquer.
      * Se base sur les terrains constructibles des adversaires ainsi que de leur tresorie.
      * Retourne vrai s'il faut bloquer le jeu de constructions
      */
	 this.doBlocage = function(){
	   // On compte le nombre joueurs qui peuvent construire
	   for (var index in joueurs) {
		var joueur = joueurs[index]; if (!this.equals(this)) { var groups =
		joueur.findGroupes();
		  if (groups.size() > 0) {
		   // On verifie si le budget est important ()
		    // On compte le potentiel de maison achetables
		    var nbMaisons = 0;
		    var coutMaisons = 0;
		    for (var color in groups) {
			 var group = groups[color];
		      count+=group.proprietes.length;
			 for (var index in group.proprietes) {
			  var maison = group.proprietes[index];
			  nbMaisons+= 5 - maison.nbMaison;
			  coutMaisons+= (5 - maison.nbMaison) * maison.prixMaison;
			 }			 
		    }
		    var budgetMin = (coutMaisons/nbMaisons)*3;
		    if (nbMaisons > 3 && budgetMin < joueur.montant) {
			// On doit bloquer la construction
			return true;
		    }
		  }
		}
	   }
	   return false;
	 }
      
      /* Construit des maisons / hotels 
      * Calcul les groupes constructibles, verifie l'argent disponible. Construit sur les proprietes ou peuvent tomber les adversaires (base sur leur position et les stats au des)
      * Possibilite d'enregistrer tous les deplacements des joueurs pour affiner les cases les plus visitees
      */
     this.buildConstructions = function(){
		 
		 var groups = this.findGroupes();	// structure : [color:{color,proprietes:[]}]
		 // Pas de terrains constructibles
		 if (groups.size() == 0) {
		   return;	
		 }
		 
		 var budget = this.comportement.getBudget(this);
		 // Pas d'argent
		 if(budget < 5000){
		 	return;
		 }
		 // On determine les terrains les plus rentables a court terme (selon la position des joueurs)
		 var maisons = this.comportement.getNextProprietesVisitees(this,0.1);
		 /* Plusieurs regles pour gerer les constructions : 
		 * Si un seul groupe, on construit notre budget dessus
		 * Si plusieurs groupes avec des taux equivalent, on construit sur le groupe le plus rentable (basé sur stats et sur cout)
		 * On construit jusqu'a obtenir 3 maisons partout (seuil de rentabilité). On construit ensuite sur l'autre groupe
		 * On construit toujours plus sur la maison la plus chere
		 * S'il reste du budget, on recupere les terrains sans interet et on construit dessus
		 * On calcule la somme des taux par groupe
		 */
		 // On Calcule pour chaque maison des groupes (meme ceux sans interet) plusieurs indicateurs : proba (pondere a 3), la rentabilite (pondere a 1)
		 var totalMaisons = 0;	// Nombre total de proprietes constructibles
		 for (var color in groups) {
		  var group = groups[color];
		  group.proba = 0;
		  group.rentabilite = 0;
		  group.lessThree=0;
		  group.interetGlobal=0;
		  for (var index in group.proprietes) {
		    var propriete = group.proprietes[index];
		    totalMaisons++;
		    // On cherche si proba
		    if (maisons[propriete.id]!=null) {
			 group.proba+=maisons[propriete.id].proba*3;
		    }
		    group.rentabilite+=propriete.getRentabilite();
		    group.lessThree+= (propriete.nbMaison <=3) ? 0.5 : 0;
		  }
		 }
		 // On trie les groupes
		 var sortedGroups = [];
		 for (var color in groups) {
			var group = groups[color];
			group.interetGlobal = group.proba + group.rentabilite + ((group.lessThree > 0)?0.5:0);
		  	sortedGroups.push(group);
		 }
		 sortedGroups.sort(function(a,b){
		 	if(a.interetGlobal == b.interetGlobal){return 0;}
		 	if(a.interetGlobal > b.interetGlobal){return -1;}
		 	return 1;
		 });

		 // On construit des maisons. On s'arrete quand plus de budget ou qu'on ne peut plus construire (hotel partout ou 4 maisons (blocage de constructions))
		 var stopConstruct = false;
		 var currentMaison = 0;
		 var currentGroup = 0;		 
		 var seuil = 3;	// Premier passage, ensuite passe a 4 ou 5
		 while(budget >= 5000 && ! stopConstruct){
		   // On choisit une maison
		 	var group = sortedGroups[currentGroup];
			// Changement de group
		    var maison = group.proprietes[currentMaison];
		    // On invalide la maison et on passe a la suivante, ou au groupe suivant ou au seuil suivant
		    if(maison.nbMaison>=seuil){
			    if(group.treat == null){
				group.treat = 1;
			    }
			    else{
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
				  }
				  else{
				    // Fin du traitement
				    stopConstruct = true;
				  }
				}
			    }
			    else{
				// Maison suivante dans le groupe
				currentMaison = (currentMaison+1)%group.proprietes.length;	
			    }			
		    }
		    else{
			    // On achete	
			    budget-=maison.prixMaison;
			    this.payer(maison.prixMaison);
			    maison.buyMaison(this,true);	
			    console.log("Buy one house for " + maison.prixMaison  + " on " + maison.id);
			    currentMaison = (currentMaison+1)%group.proprietes.length;	
		    }		    		  
		 }
		 $('body').trigger('refreshPlateau');
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
		// On garde la meme si aucune n'est interessante
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
		var family = new Array();
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
	 		// On boucle sur les fiches et on verifie qu'elles sont soit libre, soit e nous
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
	 this.bloque = false;	// Indique que le joueur est bloque. Il doit se debloquer pour que le jeu continue
	 this.defaite = false;
	 
      this.equals = function (joueur) {
          if (joueur == null) {
              return false;
          }
          return this.numero == joueur.numero;
      }
      
      /* Renvoie les stats et infos du jour : 
      * Nombre de tour, nombre de fois en prison
      * Nombre de terrains, nombre de maison et hotel
      * Argent disponible, argent apres vente maison / hypotheque, argent apres hypotheque
      */
      this.getStats = function(){
		var stats = {prison:this.pion.stats.prison,tour:this.pion.stats.tour,argent:this.montant,argentDispo:this.montant,argentDispoHypo:this.montant,hotel:0,maison:0};
		for(var index in this.maisons){    
		  var maison = this.maisons[index];
		  stats.hotel+= parseInt(maison.hotel==true ? 1 : 0);
		  stats.maison+= parseInt(maison.hotel==false ? maison.nbMaison : 0);
		  stats.argentDispo+=maison.nbMaison*(maison.prixMaison/2) + maison.achat/2; // Revente des maisons + hypotheque
		  stats.argentDispoHypo+=(!maison.isGroupee())?maison.achat/2:0; // hypotheque des terrains non groupes
		}
		return stats;
      } 

	 /* Selectionne le joueur */
	 this.select = function(){
	   if (this.div) {
		this.div.find('div:first').addClass('joueurCourant');
	   }	   
	   if (!this.enPrison) {
		  this.nbDouble = 0;
	   }
	   this.joue();
	 }
	 
	 this.getPosition = function(){
	   return {pos:this.pion.pos,etat:this.pion.etat};
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
              var input = '<input type=\"button\" id=\"idInputFiche' + id + '\" class=\"ui-corner-all color_' + maison.color.substring(1) + '\" style=\"display:block;height:27px;width:280px;\" value=\"' + maison.nom + '\" id=\"fiche_' + id + '\"/>';
              if (m != null) {
                  m.after(input);
              } else {
                  this.div.append(input);
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
		var paiement = this.payer(montant);
		  if(paiement==true){
		      parcGratuit.payer(montant);
	      }
      }

      this.setPion = function (color) {
          this.pion = new Pion(color, this);
      }
	 
	 /* Paye la somme demandee. Si les fonds ne sont pas disponibles, l'utilisateur doit d'abord réunir la somme, on le bloque */
      this.payer = function (montant) {
      	/* Verifie si le joueur peut payer */
      	if(montant > this.montant){
      		this.bloque = true;
      		this.resolveProblemeArgent(montant);
      		return false;
      	}
	     this.montant -= montant;
          this.setArgent(this.montant);
          return true;
      }
	 /* Paye une somme a un joueur */
	 this.payerTo = function(montant,joueur){
	   
	 }
	 
      this.gagner = function (montant) {
          this.montant += montant;
          this.setArgent(this.montant);
      }

	/* Gestion de la defaite */
	
	this.defaite = function(dette){
		// On paye notre dette avec tout nos actifs (stats.argentDispo)
		this.div.empty();
		$('.joueurCourant',this.div).addClass('defaite');
		// On affiche un style sur la liste
		this.defaite = true;
	}
	
	 /* Resourd les problemes d'argent du joueur */
	 /* @param montant : argent a recouvrer */
	 this.resolveProblemeArgent = function(montant){
		 // On verifie si c'est possible de recuperer les sommes
		 if(this.getStats().argentDispo < this.montant - montant){
			 // Banqueroute, le joueur perd
			 this.defaite(montant);
		 }
		 // On ouvre le panneau de resolution en empechant la fermeture
		 this.montant-=montant;
		 var button = createMessage("Attention","red","Vous n'avez pas les fonds necessaires, il faut trouver de l'argent",function(){
			 // On attache un evenement a la fermeture
			 var onclose = function(e){
				 
				 if(joueurCourant.montant < 0){
					 // Message d'erreur pas possible
					 createMessage("Attention","red","Impossible, il faut trouver les fonds avant de fermer");
					 e.preventDefault();
				 }
				 else{
					 joueurCourant.bloque = false;
					 changeJoueur();
				 }
			 }
			 GestionTerrains.open(true,onclose);				
		 });
		 
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
			if(propriete.statutHypotheque == false && propriete.nbMaison == 0){
				// Aucune propriete possedee de la couleur ne doit avoir de maison
				var flag = true;
				for (var j = 0; j < this.maisons.length; j++) {
					if(this.maisons[j].color == propriete.color && this.maisons[j].nbMaison > 0){flag = false;}
				}
				if(flag){
					proprietes.push(propriete);
				}
			}
		}
		return proprietes;
	}

	/* Renvoie la liste des maisons hypothequees */
	this.findMaisonsHypothequees = function(){
	   var proprietes = [];
	   for (var i = 0; i < this.maisons.length; i++) {
		if (this.maisons[i].statutHypotheque == true) {
		  proprietes.push(this.maisons[i]);
		}
	   }
	   return proprietes;
	}
	
	/* Renvoie la liste des groupes constructibles du joueur */
      this.findGroupes = function () {
          var colorsOK = new Array();
          var colorsKO = new Array();
		var groups = [];

          for (var i = 0; i < this.maisons.length; i++) {
              var m = this.maisons[i];
              if (m.constructible == true) {
			   // Deja traite, on possede la famille, on ajoute la maison
                  if (colorsOK[m.color] == true) {
                      groups[m.color].proprietes.push(m)
                  } else {
                      if (colorsKO[m.color] == null) {
                          // On recherche si on a toutes les proprietes du groupe
                          var ok = true;
                          for (var f in fiches) {
                              if (fiches[f].constructible == true && fiches[f].color == m.color
						    && (fiches[f].joueurPossede == null || fiches[f].joueurPossede.numero != this.numero || fiches[f].statutHypotheque == true)) {
                                  ok = false;
                              }
                          }
                          if (!ok) {
						// on ne possede pas le groupe
                              colorsKO[m.color] = true;
                          } else {
						// on possede le groupe
                              colorsOK[m.color] = true;
                              groups[m.color] = {color:m.color,proprietes:[]};
						groups[m.color].proprietes.push(m);
                          }
                      }
                  }
              }
          }
          return groups;
      }
      
      /* Renvoie les groupes constructibles avec les proprietes de chaque */
      this.findMaisonsConstructibles = function () {
          var mc = new Array();
          var colorsOK = new Array();
          var colorsKO = new Array();

		// Si une maison est hypotequee, on ne peut plus construire sur le groupe
		
          for (var i = 0; i < this.maisons.length; i++) {
              var m = this.maisons[i];
              if (m.constructible == true) {
                  if (colorsOK[m.color] == true) {
                      mc[mc.length] = m; // on a la couleur, on ajoute
                  } else {
                      if (colorsKO[m.color] == null) {
                          // On recherche si on a toutes les couleurs
                          var ok = true;
					 // On cherche une propriete qui n'appartient pas au joueur
                          for (var f in fiches) {
                              if (fiches[f].constructible == true && fiches[f].color == m.color &&
						    (fiches[f].joueurPossede == null || !fiches[f].joueurPossede.equals(this)) || fiches[f].statutHypotheque == true) {
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
	 this.stats = {tour:0,prison:0};	// stat du joueur
      this.pion = new PionJoueur(color, fiches["2-0"].drawing.getCenter().x, fiches["2-0"].drawing.getCenter().y);
      Drawer.addRealTime(this.pion);

      // Ca directement en prison, sans passer par la case depart, en coupant
      this.goPrison = function () {
	   this.stats.prison++;
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
		drawing.getCenter();
		this.pion.x = center.x;
		this.pion.y = center.y;
		if (DEBUG) {
		  console.log(joueurCourant.numero + " va a " + etat + "-" + pos);
		}	 
		this.gotoCell(etat, pos, call);
      }

      // Si on passe par la case depart, on prend 20000 Francs
      this.treatCaseDepart = function (etatCible, posCible) {
          if (!this.joueur.isEnPrison() && this.position == 0 && this.etat == 2 && this.position != posCible && this.etatCible != this.etat) {
              this.stats.tour++;
		    this.joueur.gagner(20000);
          }
      }

      this.goDirectToCell = function (etat, pos) {
          // On calcule la fonction affine
          var p1 = fiches[this.etat + "-" + this.position].
      drawing.getCenter()
      var p2 = fiches[etat + "-" + pos].
      drawing.getCenter()
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
          drawing.decalagePion();
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
      drawing.getCenter();
      }
  }

  function CarteActionSpeciale(titre, actionSpeciale, etat, pos) {
      this.titre = titre;
      this.actionSpeciale = actionSpeciale;

      this.drawing = new CaseSpeciale(etat, titre);
  Drawer.add(this.drawing);

  this.action = function () {
      this.actionSpeciale();
      changeJoueur();
  }
  }

  function CarteSpeciale(titre, montant, etat, pos, img) {
      this.drawing = new Case(pos, etat, null, titre, CURRENCY + " " + montant, img);
  Drawer.add(this.drawing);
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
      this.drawing = new Case(pos, etat, null, titles.chance, null, {
      src: "img/interrogation.png",
      width: 50,
      height: 60
  });
  Drawer.add(this.drawing);
  this.action = function () {
      var c = cartesChance[Math.round((Math.random() * 1000)) % (cartesChance.length)];
      return c.action();
  }
  }

  function CaisseDeCommunaute(etat, pos) {
      this.drawing = new Case(pos, etat, null, titles.communaute, null, {
      src: "img/banque.png",
      width: 50,
      height: 50
  });
  Drawer.add(this.drawing);
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
	 intervals:[],	// Stocke les flags d'arret du refresh
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
		if (Drawer.intervals[canvas.canvas.id] != null) {
		    clearInterval(Drawer.intervals[canvas.canvas.id]);
		}
		Drawer.intervals[canvas.canvas.id] = setInterval(function () {
		    Drawer.refresh(canvas);
		}, time);          
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
		
		$('body').bind('refreshPlateau',function(){
		  Drawer.refresh(Drawer.canvas);    
		});
          return this;
      }
  };


  /* @param size : font-size */
  /* @param specificWidth : largeur specifique (plutet que la largeur habituelle, largeur */

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
		canvas.strokeStyle = "#FF0000";//"rgba(255, 255, 255, 0)"
          canvas.beginPath();
          canvas.arc(this.x, this.y, this.largeur / 2, 0, 2 * Math.PI);          
		canvas.fill();
		canvas.closePath();
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
		canvas.beginPath();
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
   		canvas.closePath();
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
		canvas.closePath();
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
          this.imgMaison.src = "img/maison.png";
          this.imgHotel.src = "img/hotel.png";
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
		    image.margin = img.margin;
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
              var dec = 10 + ((color != null) ? bordure : 10) + ((title != null) ? 10 : 0) + (this.data.image.margin ||0);
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
		var family = new Array();
		for(var fiche in fiches){
			if(fiches[fiche].statut!=null && fiches[fiche].color == color){
				family.push(fiches[fiche]);
			}
		}
		return family;
	}

  function Fiche(etat, pos, colors, nom, groupe, achat, loyers, prixMaison, img) {
      this.statut = ETAT_LIBRE;
      this.joueurPossede = null;
      this.nom = nom;
	  this.groupe = groupe;
      this.color = colors[0];
      this.secondColor = (colors.length == 2) ? colors[1] : colors[0];
      this.achat = achat;
      this.montantHypotheque = achat / 2;
      this.statutHypotheque=false;
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
	 this.input = null;	// Bouton 

      this.drawing = new Case(pos, etat, this.color, this.nom, CURRENCY + " " + achat, img);
  Drawer.add(this.drawing);

  this.vendu = function (joueur) {
      this.statut = ETAT_ACHETE;
      this.joueurPossede = joueur;
  }
  
  /* Renvoie la rentabilite de la propriete. Se base sur le rapport entre le loyer de trois maisons et le prix d'achat d'une maison */
  this.getRentabilite = function(){
	 var ponderation = 10;	// Facteur pour nivelle le taux
  	if(!this.constructible || this.nbMaison >=3){
  		return 0;
  	}
  	else{
	   // Maison du groupe
	   var proprietes = getFichesOfFamily(this.color);
	   var nbMaisonsConstruites = 0;
	   for (var i = 0 ; i < proprietes.length ; i++) {
		nbMaisonsConstruites+=proprietes[i].nbMaison;
	   }
	   return (this.loyer[3] / ((proprietes.length*3 - nbMaisonsConstruites)*this.prixMaison)) / ponderation;
  	}
  }
  
  this.getNbByGroupe = function(){
  	var count = 0;
  	for(var id in fiches){if(fiches[id].color == this.color){count++;}}
  	return count;
  }
  
  /* Hypotheque le terrain */
  this.hypotheque = function(){
    if (this.input == null || this.statut != ETAT_ACHETE) {
	 return;
    }
    this.statutHypotheque=true;
    this.input.addClass('hypotheque');
    this.joueurPossede.gagner(this.montantHypotheque);
  }
  
  this.leveHypotheque = function(){
    if (this.input == null || this.statut != ETAT_ACHETE || this.statutHypotheque == false) {
	 return;
    }
    var cout = Math.round(this.montantHypotheque*1.1);
    if (this.joueurPossede.montant < cout) {
	 throw "Impossible de lever l'hypotheque";
    }
    this.statutHypotheque=false;
    this.joueurPossede.payer(cout);
    this.input.removeClass('hypotheque');
  }
  
  this.isLibre = function () {
      return this.statut == ETAT_LIBRE;
  }

  /* Modifie le nombre de maison sur le terrain */
  this.setNbMaison = function (nb,noRefresh) {
      this.nbMaison = nb;
      this.drawing.nbMaison = nb;
	 // Lancer un evenement pour rafraichir le plateau
	 if(!noRefresh){
	   $('body').trigger('refreshPlateau');
	 }
  }

  this.action = function () {
      this.fiche.dialog('option', 'title', nom);
      // si on est chez soit, on affiche pas
      if (this.joueurPossede != null && this.joueurPossede.equals(joueurCourant)) {
          return this.chezSoi();
      }
      if (this.joueurPossede != null && this.statutHypotheque == false) { // on doit payer un loyer
          return this.payerLoyer();
      }

      return this.openFiche();
  }

  this.chezSoi = function () {
      return createMessage("Vous etes " + this.nom, this.color, "Vous etes chez vous", changeJoueur)
  }

	this.buyMaison = function(joueur,noRefresh){
		if(joueur == null || !this.joueurPossede.equals(joueur) || this.nbMaison >=5){
			return;
		}
		this.setNbMaison(this.nbMaison+1,noRefresh);
		if(this.nbMaison == 5){
			this.hotel = true;
		}
	}

  this.getLoyer = function () {
	 if (this.statutHypotheque) {
	   return 0;
	 }
      if (this.hotel == true) {
          return this.loyerHotel;
      }
      if (this.nbMaison == 0 && this.isGroupee()) {
          return this.loyer[0] * 2;
      }
      return this.loyer[this.nbMaison];
  }

  this.payerLoyer = function () {
      return createMessage("Vous etes " + this.nom, this.color, "Vous etes chez " + this.joueurPossede.nom + " vous devez payez la somme de " + this.getLoyer() + " " + CURRENCY, function (param) {
          param.joueurPaye.payerTo(param.loyer,param.joueurLoyer);
          //param.joueurLoyer.gagner(param.loyer);
          changeJoueur();
      }, {
          loyer: this.getLoyer(),
          joueurPaye: joueurCourant,
          joueurLoyer: this.joueurPossede
      });
  }

  this.noArgent = function () {
      //construireMaisons(true);
  }

   // Ouvre la fiche d'une propriete
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

  function FicheGare(etat, pos, color, nom, achat, loyers,img) {
      Fiche.call(this, etat, pos, color, nom, null,achat, loyers, null, img || {
          src: "img/train.png",
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
      Fiche.call(this, etat, pos, color, nom, null, achat, loyers);
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

  function getWinner() {
    var defaites = 0;
    var gagnantProbable;
    for(var index in joueurs){
	   if(joueurs[index].defaite == true){
		   defaites++;
	   }
	   else{
		   gagnantProbable = joueurs[index];
	   }
    }
    if (defaites == joueurs.length -1) {
	 return gagnantProbable;
    }
    return null;
  }

  function getNextJoueur() {
     // On verifie s'il y a encore de joueurs "vivants"
	if (joueurCourant.bloque) {
	   return null;
	 }
	 var gagnant = getWinner();
	 if(gagnant != null){
	 	// On a un vainqueur
		throw gagnant;		
	 }
	 var joueur = joueurCourant;
      if (des1 != des2) {
		var pos = 0;
          joueur = joueurs[(joueur.numero + 1) % (joueurs.length)];
		while (joueur.defaite == true & pos++<joueurs.length) {
		  joueur = joueurs[(joueur.numero + 1) % (joueurs.length)];
		}
      }
	 return joueur;
  }

  function changeJoueur() {
	 // Joueur bloque, on le debloque avant de continuer
	 var joueur = null;
	 try{
	   joueur = getNextJoueur();
	 }catch(gagnant){
	     createMessage("Fin de partie","green","Le joueur " + gagnant.nom + " a gagné");
		return gagnant;
	 }
	 if (joueur == null) {
	   return null;
	 }
		 
      $('#idLancerDes,.action-joueur').removeAttr('disabled');
	 if (des1 != des2) {
          nbDouble = 0;
	 }
	 selectJoueur(joueur);
	 return null;
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
      $('#idLancerDes,.action-joueur').attr('disabled', 'disabled');
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
              var buttons = createMessage("Libere de prison", "lightblue", "Vous etes liberes de prison grece e un double", function () {
			 joueurCourant.exitPrison();	 
		    }, {});
              joueurCourant.actionApresDes(buttons, null);
          } else {
              if (joueurCourant.nbDouble == 2) {
                  var buttons = createMessage("Libere de prison", "lightblue", "Vous etes liberes de prison, mais vous devez payer " + CURRENCY + " 5.000 !", function () {
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
	 GestionTerrains.init();
      
     
  }

	function initJoueurs(){
	 var nb = 2;//prompt("Nombre de joueurs ?");
      for (var i = 0; i < nb; i++) {
          var id = 'joueur' + i;
          var joueur = null;
          if (i == 0) {
              joueur = new Joueur(i, "Joueur " + (i + 1));
          } else {
              joueur = new JoueurOrdinateur(i, "Joueur " + (i + 1));
          }
          joueurs[i] = joueur;
          $('#informations').append('<div id=\"' + id + '\"><div><span class="joueur-name">' + joueur.nom + '</span> : <span class="compte-banque"></span> ' + CURRENCY 
            + '<span class="info-joueur" title="Info joueur" data-idjoueur="' + i + '"><img src="img/info-user.png" style="cursor:pointer;width:16px;float:right"/></span></div></div><hr/>');
          joueur.setDiv($('#' + id));
          joueur.setPion(colorsJoueurs[i]);
      }
      joueurCourant = joueurs[0];
      selectJoueurCourant();

      $('#message').dialog({
          autoOpen: false
       });
      $('#message').prev().css("background", "url()");

      // panneau de creation
      $('#achatMaisons').dialog({
          autoOpen: false,
          title: "Achat de maisons / hetels",
          width: 500,
          height: 300
      });
      $('.info-joueur').tooltip({
      content:function(){
        var stats = getJoueurById($(this).data('idjoueur')).getStats();
        $('span[name]','#infoJoueur').each(function(){
          $(this).text(stats[$(this).attr('name')]);
        });
        return $('#infoJoueur').html();
      }
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
      	url:'data/' + plateau,
      	dataType:'json',
      	success:function(data){
		  loadPlateau(data);
		  Drawer.init(800, 800);
		  if(callback){
		    callback();
		  }			
      	},
      	error:function(a,b,c){
      		alert("Le plateau " + plateau + " n'existe pas");
      		return;
      	}
      });
	 
  }


  /* Charge les donnees du plateau */
  function loadPlateau(data) {
    parcGratuit = new ParcGratuit();
    CURRENCY = data.currency;
    titles = data.titles;
    var colors = [];
    $(data.fiches).each(function(){
	    var fiche = null;
	    switch(this.type){
		    case "propriete":
			    fiche = new Fiche(this.axe, this.pos, this.colors, this.nom, this.groupe, this.prix, this.loyers, this.prixMaison);
			    break;
		    case "compagnie":
			    fiche = new FicheCompagnie(this.axe, this.pos, this.colors,this.nom, this.prix, this.loyers);
			    break;
		    case "gare":
			    fiche = new FicheGare(this.axe, this.pos, this.colors, this.nom,this.prix, this.loyers,data.images.gare);
			    break;
		    case "chance":
			    fiche = new Chance(this.axe, this.pos);
			    break;
		    case "communaute":
			    fiche = new CaisseDeCommunaute(this.axe, this.pos);
			    break;
		    case "taxe" : 
			    fiche = new CarteSpeciale(this.nom, this.prix, this.axe, this.pos,{
				   src: "img/bijou.png",
				   width: 40,
				   height: 50
			    });
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
	    if (fiche.color!=null) {
		 if (colors[fiche.color]==null) {
		   // On genere un style
		   $('style','head').prepend('.color_' + fiche.color.substring(1) + '{color:white;font-weight:bold;background-color:' + fiche.color + ';}\n');
		   colors[fiche.color] = 1;
		 }
	    }
    });
    // On charge les cartes chances et caisse de communaute
    if (data.chance) {
      $(data.chance.cartes).each(function(){
	   cartesChance.push(new CarteChance(this.nom, (this.montant>0)?new GagnerCarte(this.montant):new PayerCarte(this.montant)));
	 });
    }
    if (data.communaute) {      
	 $(data.communaute.cartes).each(function(){
	  cartesCaisseCommunaute.push(new CarteCaisseDeCommunaute(this.nom, (this.montant>0)?new GagnerCarte(this.montant):new PayerCarte(this.montant)));
	 });
    }
    
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



  
  var GestionTerrains = {
	  maisonsToLever:[],
	  changesConstructions:[],
	  cout:0,
	  totalRestant:0,
	  divCout:null,
	  divArgentRestant:null,
	  banqueroute:false,
	  panel:null,
	  /* Remet a 0 le panneau */
	  open:function(banqueroute,onclose){
	  	if(banqueroute){
	  		this.banqueroute = true;
	  	}
	  	else{
	  		this.banqueroute = false;
	  	}
	  	if(onclose){
	  		this.panel.unbind('dialogbeforeclose').bind('dialogbeforeclose',onclose);
	  	}
	  	else{
		  	this.panel.unbind('dialogclose');
	  	}
	  	this.panel.dialog('open');
	  },
	  reset:function() {
	    this.Hypotheque.reset();
	    this.LeverHypotheque.reset();
	    this.Constructions.reset();
	    this.cout=0;
	    $('#coutAchats > span[name]').text(0);
	    $('.currency-value').text(CURRENCY);
	    this.update();		  
	  },
	  init:function(){
		this.divArgentRestant = $('#idArgentRestant');
		this.divCout = $('#idCoutTotal');
		this.Hypotheque.init();
		this.LeverHypotheque.init();
		this.Constructions.init();
		this.panel = $('#housesPanel');
		this.panel.dialog({
		  width:800,
		  height:600,
		  title:'Gestion des maisons',
		  modal:true,
		  buttons:{'Fermer':function(){$('#housesPanel').dialog('close');},"Valider":function(){GestionTerrains.valider();}},
		  autoOpen:false,
		  open:function(){
			  // On charge les proprietes a hypothequer
			  GestionTerrains.load();
		  }			
		});
	  },
	  /* Charge les informations */
	  load:function(){
		  this.reset();
		  this.Hypotheque.load();
		  this.LeverHypotheque.load();
		  this.Constructions.load();
	  },
	  /* Modifie le cout global */
	  addCout:function(montant){
		  this.cout+=montant;
		  this.update();
	  },
	  /* Mets a jour le panneau */
	  update:function(){
	   // On mets a jour les maisons, si on ajoute, on ne peut pas hypothequer
	    this.Hypotheque.update();			  
	    var totals = this.Constructions.update();
	    this.divCout.text((this.cout-totals.cout) + " " + CURRENCY);
	    this.totalRestant = joueurCourant.montant + this.cout-totals.cout;
	    this.divArgentRestant.text((this.totalRestant) + " " + CURRENCY);		  
	  },
	  verify:function(){
		  try{
			 if(GestionTerrains.totalRestant < 0){
			   throw "Operation impossible : pas assez d'argent";
			 }
			  GestionTerrains.Constructions.verify();
		  }catch(e){
			  createMessage("Attention","red",e);
			  return false;
		  }
		  return true;
	  },
	  valider:function(){
		    if(!this.verify()){
			 return;
		    }
		    this.Hypotheque.valider();
		    this.LeverHypotheque.valider();
		    this.Constructions.valider();
		    
		    this.closePanel();
	  },
	  closePanel:function(){
		$('#housesPanel').dialog('close');
	  },
	  /* Gere l'hypotheque de terrain */
	  Hypotheque:{
		  table:[],
		  select:null,
		  div:null,
		  init:function(){
		    this.select = $('select','#idTerrains');
		    this.div = $('#toHypotheque');
		  },
		  reset:function(){
			  this.table=[];
			  this.select.empty();
			  this.div.empty();
			  $('#idHypothequeAction').unbind('click').bind('click',function(){GestionTerrains.Hypotheque.add();});
		  },
		  valider:function(){
		    // On recupere les fiches et on hypotheque les biens
		    for(var id in this.table){
			  this.table[id].hypotheque();
		    }
		  },				
		  update:function(){
			  $('option[data-color]',this.select).removeAttr('disabled');
			  // On desactive les propriete qui ont des terrains construits
			  var colors = GestionTerrains.Constructions.getGroupesConstruits();
			  for (var i in colors){
				  $('option[data-color="' + colors[i] +'"]',this.select).attr('disabled','disabled');
			  }
		  },			
		  /* Charge les terrains hypothequables */
		  load:function(){		    
			  var proprietes = joueurCourant.findMaisonsHypothecables();
			    $(proprietes).each(function(){
				    GestionTerrains.Hypotheque.addOption(this);
			    });
		  },
		  addGroup:function(group){
			 for (var index in group.proprietes) {
			   this.addOption(group.proprietes[index]);
			 }
		  },
		  addOption:function(fiche){
		    // On verifie si l'option n'existe pas
		    if (this.select.find('option[value="' + fiche.id + '"]').length > 0) {
			 return;
		    }
			var option = $("<option data-color='" + fiche.color + "' value='" + fiche.id + "'>" + fiche.nom + " (+" + fiche.montantHypotheque + " " + CURRENCY + ")</option>");
			option.data("fiche",fiche);			
			this.select.append(option);
		  },
		  /* Ajoute une propriete aux hypotheques */
		  add:function(){
			  var terrain =  $('option:selected',this.select);
			  var fiche = terrain.data("fiche");
			  this.table[fiche.id] = fiche;
			  var div = $('<div>' + fiche.nom + '</div>');
			  var boutonAnnuler = $('<button style="margin-right:5px">Annuler</button>');
			  var _self = this;
			  boutonAnnuler.click(function(){
				  _self.addOption(fiche);
				  $(this).parent().remove();
				  GestionTerrains.addCout(-fiche.hypotheque);
				  delete _self.table[fiche.id];
				  // On permet l'achat de maison sur les terrains si aucune maison hypotheque
				  // On prend toutes les couleurs et on les elimine
				  var colors = [];
				  for (var id in _self.table) {
				     colors.push(_self.table[id].color.substring(1));
				  }
				  GestionTerrains.Constructions.showByColors(colors);
			  });
			  div.prepend(boutonAnnuler);
			  this.div.append(div)
			  $('option:selected',this.select).remove();
			  GestionTerrains.addCout(fiche.montantHypotheque);
			  // On empeche l'achat de maisons sur les terrains de ce groupe
			  GestionTerrains.Constructions.removeByColor(fiche.color);
		  }
	  },
	  LeverHypotheque:{
		  div:null,
		  table:[],
		  init:function(){
		    this.div = $('#idTerrainsHypotheques > div');
		  },
		  reset:function(){
			  this.div.empty();
			  this.table=[];
		  },
		  valider:function(){
		    for(var id in this.table){
			  this.table[id].leveHypotheque();
		    }
		  },
		  load:function(){
			  var proprietes = joueurCourant.findMaisonsHypothequees();
		    $(proprietes).each(function(){
			   var fiche = this;
			   var div = $("<div>" + this.nom + "</div>");
			   var boutonLever = $('<button style="margin-right:5px">Lever</button>');
			   boutonLever.click(function(){
				  GestionTerrains.LeverHypotheque.lever($(this),fiche);
			   });
			   div.prepend(boutonLever);
			   GestionTerrains.LeverHypotheque.div.append(div);
		    });
		  },
		  lever:function(input,fiche){
			  input.attr('disabled','disabled');
			  this.table.push(fiche);
			  GestionTerrains.addCout(-Math.round(fiche.montantHypotheque*1.1));
		  },
		  
	  },
	  Constructions:{
		  table:[],
		  div:null,
		  infos:null,
		  init:function(){
		    this.div = $('#idTerrainsConstructibles');
		    this.infos = $('#coutAchats');
		  },
		  /* Verifie pour la validation et renvoie une exception */
		  verify:function(){
			  var testGroups = [];
			  $('select[data-color]',this.div).each(function(){
				  var color = $(this).get(0).dataset.color;
				  if (testGroups[color]==null) {
					  testGroups[color] = {min:5,max:0};
				  }
				  testGroups[color].min = Math.min(testGroups[color].min,$(this).val());
				  testGroups[color].max = Math.max(testGroups[color].max,$(this).val());
			  });
			  for (var color in testGroups) {
				  if(testGroups[color].max - testGroups[color].min > 1){
				    throw "Il faut equilibrer les maisons";  
				  }
			 }
		  },
		  valider:function(){
		    for (var achat in this.table) {
			  var data = this.table[achat];
			  data.propriete.setNbMaison(data.nbMaison);
			  joueurCourant.payer(data.cout);
		    }
		  },
		  reset:function(){
			  this.table = [];
			  this.div.empty();
		  },
		  getGroupesConstruits:function(){
			  var colors = [];
			  $('select[data-color]:has(option:selected[value!=0])',this.div).each(function(){
				  colors.push($(this).attr('data-color'));
			  });
			  return colors;
		  },
		  update:function(){
			  var totals = {nbMaison:0,nbHotel:0,cout:0}
			  for (var achat in this.table) {
				  var data = this.table[achat];
				  totals.cout+=data.cout;
				  totals.nbMaison+=data.maison || 0;
				  totals.nbHotel+=data.hotel || 0;
			  }
			  $('span[name]',this.infos).each(function(){
				  $(this).text(totals[$(this).attr('name')]);
			  });
			  return totals;
		  },
		  /* Supprime la possibilite d'acheter des maisons sur les terrains de cette couleur */
		  removeByColor:function(color){
		    this.div.find('div[class*="-' + color.substring(1) + '"]').hide();
		  },
		  showByColors:function(exludeColors){
		    var selectors = "div";
		    for (var index in exludeColors) {
			 selectors+=':not([class*="-' + exludeColors[index] + '"])';
		    }
		    console.log(selectors);
		    this.div.find(selectors).show();
		  },
		  load:function(){
			  var groups = joueurCourant.findGroupes();
			  var table = $('#idTerrainsConstructibles');
			  for(var color in groups) {
				  var divTitre = $('<div style="cursor:pointer" class="group-' + color.substring(1) + '">Groupe <span style="color:' + color + ';font-weight:bold">' + groups[color].proprietes[0].groupe + '</span></div>');
				  divTitre.data("color",color.substring(1));
				  divTitre.click(function(){
					  var id = 'div.propriete-' + $(this).data('color');
					  if($(id + ':visible',this.div).length == 0){
						  $(id,this.div).slideDown();	// On ouvre
					  }
					  else{
						  $(id,this.div).slideUp();
					  }
				  });			  
				  this.div.append(divTitre);
				  var group = groups[color];
				  for(var index in group.proprietes){
					  var propriete = groups[color].proprietes[index];
					  var divTerrain = $('<div class="propriete propriete-' + propriete.color.substring(1) + '"></div>');
					  divTerrain.append('<span style="color:' + propriete.color + '" class="title-propriete">' + propriete.nom + '</span>');
					  var select = $('<select data-color="' + propriete.color + '" class="' + ((propriete.nbMaison==5)?'hotel':'maison') + '"></select>');
					  select.data("propriete",propriete);
					  select.data("group",group);
					  for (var j = 0; j <= ((GestionTerrains.banqueroute) ? propriete.nbMaison : 5); j++) {
						  select.append("<option class=\"" + ((j==5)?"hotel":"maison") + "\" value=\"" + j + "\" " + ((propriete.nbMaison == j) ? "selected" : "") + ">x " + ((j==5)?1:j) + "</option>");
					  }
					  var _self = this;
					  select.change(function(){
						  var prop = $(this).data("propriete");
						  // On verifie changement par rapport a l'origine
						  if (prop.nbMaison == $(this).val()) {
							  delete _self.table[prop.id];
							  $('~span',this).text("");
							  GestionTerrains.update();
							  return;
						  }
						  var data = ($(this).val() == 5)?{hotel:1}:{maison:$(this).val() - prop.nbMaison};
						  data.propriete = prop;
						  data.nbMaison = $(this).val();
						  data.cout = ($(this).val() > prop.nbMaison)
						    ?($(this).val()-prop.nbMaison)*prop.prixMaison
						    :($(this).val()-prop.nbMaison )*prop.prixMaison/2;
						    $(this).removeClass().addClass(($(this).val()==5)?'hotel':'maison');
						  $('~span',this).text(data.cout);
						  _self.table[prop.id] = data;
						  GestionTerrains.update();
						  
						  // Si le groupe est vide, on permet l'hypotheque des terrains
						  var nbMaisons = 0;
						  var gr = $(this).data("group");
						  GestionTerrains.Constructions.div.find('select[data-color="' + prop.color + '"]').each(function(){
						    nbMaisons+=parseInt($(this).val());
						  });
						  if (nbMaisons == 0) {						    
						    // Le groupe est hypothecable
						    GestionTerrains.Hypotheque.addGroup(gr);
						  }
				   });
				   divTerrain.append(select).append('<span></span> ' + CURRENCY);						 
				   $(this.div).append(divTerrain);
				  }
			  }
		  }		
	  }	  
  };
  

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
      $('.infos-group', div).removeClass("nbMaisons");
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
    if (!joueur.equals(joueurCourant)) {
	 $('#informations > div > div').removeClass('joueurCourant');
    }
    joueurCourant = joueur;    
    joueur.select();	 
  }
  function getJoueurById(numero){
    for(var joueur in joueurs){
      if(joueurs[joueur].numero == numero){
        return joueurs[joueur];
      }
    }
    return null;
  } 
  
  
  /* Fonction utilitaire pour le debug */
  
  /* Achete des maisons pour le joueur courant, on passe les ids de fiche */
  function buy(maisons){
  	for(var i in maisons){
  		joueurCourant.acheteMaison(fiches[maisons[i]],maisons[i]);
  	}
  }
