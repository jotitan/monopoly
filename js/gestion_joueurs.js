import {Joueur} from './entity/joueur.js'
import {JoueurOrdinateur} from "./entity/joueur_robot.js";
import {CURRENCY,VARIANTES,globalStats,startMonopoly} from "./monopoly.js"
import {GestionFiche} from "./display/case_jeu.js";
import {GestionEchange} from "./enchere.js";
import {GestionDes} from "./entity/dices.js";
import {InfoMessage} from "./display/message.js";


/* Gere les joueurs : creation, changement... */
let GestionJoueur = {
    colorsJoueurs : ["#383C89", "#A6193E", "#C58F01", "#086B3D", "#B9B29B","#663300"],
    imgJoueurs : [],
    joueurs:[],
    joueurCourant:null,
    getJoueurCourant(){
        return this.joueurCourant;
    },
    setColors(colors){
      if(colors !=null){
          this.colorsJoueurs = colors;
      }
    },
    setImgJoueurs(img){
      if(img != null){
          this.imgJoueurs = img;
      }
    },
    getNbJoueurs(){
        return this.joueurs.length;
    },
    // renvoi le nombre de joueur dans la partie
    getNb(){
        return this.joueurs.reduce((somme,j)=>somme+=!j.defaite?1:0,0);
    },
    createAndLoad(isRobot,i,nom,data,montantDepart){
        let clazzPlayer = isRobot ? JoueurFactory.getRobotPlayer():JoueurFactory.getCurrentPlayer()
        return this.create(clazzPlayer,i,nom,data.defaite,0,montantDepart).load(data);
    },
    init(){
        $('.panneau_joueur').empty();
        this.joueurs = [];
        this.joueurCourant = null;
    },
    lancerDes(){
        this.joueurCourant.lancerDes();
    },
    displayLineByGroups(){
        let groups = GestionFiche.getGroups();
        let sizeBlock = 45 / groups.size();
        let div = $('<div style="width:100%" class="count-property"></div>')
        for(let name in groups){
            let color = name.replace(/ /g,"");
            div.append(`<span style="width:${sizeBlock}vw;background-color:${groups[name]}"></span> : <span class="counter-group ${color}">0</span>`);
        }
        return div;
    },
    create(clazz, i, nom,defaite, argentDepart, montantDepart){
        let id = `joueur${i}`;
        let color = this.colorsJoueurs[i];
        let img = this.imgJoueurs[i];
        let joueur = new clazz(i, nom, color,argentDepart,montantDepart);
        joueur.setEnableMouseFunction(JoueurFactory.mouseFunction);
        let isDefaite = defaite ? ' class="defaite" ':'';
        let div = $(`<div id="${id}"${isDefaite}></div>`);
        $(div).append(`<div class="joueur-bloc"><span class="joueur-id"><span class="joueur-name">${joueur.nom}</span> : <span class="compte-banque"></span> ${CURRENCY}</span><span class="info-joueur" title="Info joueur" data-idjoueur="${i}"><img src="img/info-user2.png" style="cursor:pointer;width:24px;float:right"/></span></div>`)
        $(div).append(this.displayLineByGroups());
        $('.panneau_joueur').append('<hr style="border:solid 2px darkgray"/>').append(div);

        joueur.setDiv($(`div[id="${id}"]`));
        joueur.setPion(color,img,montantDepart);
        // On defini la couleurs
        $('#' + id + ' > div.joueur-bloc').css('backgroundImage', 'linear-gradient(to right,white 50%,' + color + ')');
        $.trigger('monopoly.newPlayer', {
            joueur: joueur
        });
        this.joueurs.push(joueur);
        return joueur;
    },
    getById(id){
        return this.joueurs.find(j=>j.numero ===parseInt(id));
    },
    /* @param idInitialJoueur : si present, joueur qui debute */
    change(idInitialJoueur){
        if(this.joueurCourant != null){
            this.joueurCourant.endTurn();
        }
        if(idInitialJoueur!=null){
            let joueur = this.getById(idInitialJoueur);
            if(joueur!=null){
                joueur.notifySelect();
                return this._select(joueur);
            }
        }
        // Si un echange est en cours, on ne change pas de joueur
        if (GestionEchange.running) {
            return;
        }
        // Joueur bloque, on le debloque avant de continuer
        let joueur = null;
        try {
            joueur = this.next();
            if(joueur != null) {
                $.trigger('monopoly.debug', {
                    message: `Change player to ${joueur.nom}`
                });
            }
        } catch (gagnant) {
            this._showVainqueur(gagnant);
            return null;
        }
        if (joueur == null) {
            return null;
        }
        joueur.notifySelect();
        GestionDes.resetDouble();
        this._select(joueur);
    },
    // Renvoie la liste des joueurs disponibles
    getAvailableSlots(){
        return this.joueurs.filter(j=>j.isSlotFree());
    },
    _showVainqueur(gagnant){
        $.trigger('monopoly.victoire',{joueur:gagnant});
        // On affiche les resultats complets
        var perdants = this.joueurs.filter(function(j){return j.defaite;});
        perdants.sort((a,b)=>{
            if(a.tourDefaite === b.tourDefaite){
                return b.numero - a.numero;
            }
            return b.tourDefaite - a.tourDefaite;
        });
        let message = `Le joueur ${gagnant.nom} a gagné en ${this._formatTempsJeu(globalStats.heureDebut)}.<br/>`;
        message+=`1 - ${gagnant.nom}<br/>`;

        for(var i = 0 ; i < perdants.length ; i++){
            message+= (i+2) + " - " + perdants[i].nom + "<br/>";
        }
        let score = this._calculateScore(gagnant);
        InfoMessage.create(this.joueurCourant,`Fin de partie : ${score} Points`, "green", message, ()=>{}, null, true,{"Recommencer":()=>startMonopoly()});
    },
    /* Calcule un score de victoire */
    /* Prend en compte l'argent, le nombre de terrains, le nombre de constructions, le nombre de tours des joueurs adverses */
    /* On pondere par rapport au nombre de joueur (plus il est grand, plus le nombre de maison a de l'importance) */
    _calculateScore(joueur){
        let statsJoueur = joueur.getStats();
        let critere1 = statsJoueur.argent/10000;
        let critere2 = (joueur.maisons.maisons.length*this.joueurs.length)/4;	// < 1
        let critere3 = 1 + statsJoueur.hotel/12 + statsJoueur.maison/32;	// < 2
        let critere4 = (statsJoueur.tour+1) * this.joueurs.length;		// ~5 * nbJoueurs
        let critere5 = 1;												// ~5 * nbJoueurs
        this.joueurs.forEach(j=>{
            critere5+=(!j.equals(joueur))?j.pion.stats.tour:0;
        });
        let score = (critere4 - critere5) * critere1 * critere2 * critere3;
        return Math.round(score);
    },
    _formatTempsJeu(beginTime){
        var time = Math.round((new Date().getTime() - beginTime)/1000);
        if(time < 60){
            return sec + " sec";
        }
        var sec = time%60;
        time = Math.round(time/60);
        return time + " min et " + sec + " sec";
    },
    _select(joueur){
            if(!joueur.canPlay){
            $('.action-joueur').attr('disabled', 'disabled').addClass('disabled');
        }else{
            $('.action-joueur').removeAttr('disabled').removeClass('disabled');
        }
        if(VARIANTES.echangeApresVente && GestionFiche.isFreeFiches()){
            $('#idEchangeTerrains').attr('disabled','disabled').addClass('disabled');
        }
        if (!joueur.equals(this.joueurCourant)) {
            $('.joueurCourant').removeClass('joueurCourant');
            if(this.joueurCourant!=null && this.joueurCourant.pion !=null){
                this.joueurCourant.pion.pion.setSelected(false);
            }
        }

        this.joueurCourant = joueur;
        this.joueurCourant.pion.pion.setSelected(true);
        joueur.select();
    },
    getWinner() {
        var defaites = 0;
        var gagnantProbable;
        for (var index in this.joueurs) {
            if (this.joueurs[index].defaite === true) {
                defaites++;
            } else {
                gagnantProbable = this.joueurs[index];
            }
        }
        if (defaites === this.joueurs.length - 1) {
            return gagnantProbable;
        }
        return null;
    },
    next(){
        if (this.joueurCourant == null) {
            return this.joueurs[0];
        }
        // On verifie s'il y a encore des joueurs "vivants"
        if (this.joueurCourant.bloque) {
            return null;
        }
        let gagnant = this.getWinner();
        if (gagnant != null) {
            // On a un vainqueur
            throw gagnant;
        }
        var joueur = this.joueurCourant;
        /* Changement de joueur */
        if(!GestionDes.continuePlayer() && !GestionDes.isSpecificAction()){
            var pos = 0;
            joueur = this.joueurs[(joueur.numero + 1) % (this.joueurs.length)];
            while (joueur.defaite === true && pos++ < this.joueurs.length) {
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
    forEach(callback,element){
        this.joueurs.forEach(callback,element);
    }
};


window.gestion = GestionJoueur;

// Construit les joueurs en fonction du context
let JoueurFactory = {
    // Play with network
    network:false,
    // Current instance is master of network game
    master:true,
    setMouseFunction(fct){
        this.mouseFunction = fct;
    },
    useNetwork(){
        this.network = true;
    },
    useLocal(){
        this.network = false;
    },
    setMaster(){
        this.master = true;
    },
    setSlave(){
        this.master = false;
    },
    getRobotPlayer(){
        return this.network ? NetworkJoueurOrdinateur:JoueurOrdinateur;
    },
    getCurrentPlayer(){
        return this.network ? (this.master ? NetworkJoueur : LocalPlayer) : Joueur;
    },
    getOtherPlayer(){
        return this.network ? (this.master ? MasterRemotePlayer : RemotePlayer) : Joueur;
    }
};

export {GestionJoueur,JoueurFactory};