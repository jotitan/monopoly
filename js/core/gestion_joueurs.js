import {Joueur,NetworkJoueur} from '../entity/joueur.js'
import {RemotePlayer,MasterRemotePlayer,LocalPlayer} from '../entity/network/local_joueur.js'
import {JoueurOrdinateur,NetworkJoueurOrdinateur} from "../entity/joueur_robot.js";
import {CURRENCY,VARIANTES,globalStats,restartMonopoly} from "./monopoly.js"
import {GestionFiche} from "../display/case_jeu.js";
import {GestionEchange} from "./enchere.js";
import {GestionDes} from "../entity/dices.js";
import {infoMessage} from "../display/message.js";
import {bus} from "../bus_message.js";
import {dialog} from "../display/displayers.js";
import {disableActions, enableActions} from "../utils.js";

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
        return this.joueurs.reduce((somme,j)=>somme+(!j.defaite?1:0),0);
    },
    createAndLoad(isRobot,i,nom,data,montantDepart){
        let clazzPlayer = isRobot ? JoueurFactory.getRobotPlayer():JoueurFactory.getCurrentPlayer()
        return this.create(clazzPlayer,i,nom,data.defaite,0,montantDepart).saver.load(data);
    },
    init(){
        document.querySelectorAll('.panneau_joueur').forEach(e=>e.innerHTML = '');
        this.joueurs = [];
        this.joueurCourant = null;
    },
    lancerDes(){
        this.joueurCourant.lancerDes();
    },
    displayLineByGroupsAsElement(){
        let groups = GestionFiche.getGroups();
        const sub = (groups.size()+1) * 5;
        const size = `calc((45vw - ${sub}px) / ${groups.size()+1})`;
        let sizeBlock = 35 / groups.size();
        let div = document.createElement('div');
        div.classList.add('count-property');
        for(let name in groups){
            let color = name.replace(/ /g,"");
            div.insertAdjacentHTML('beforeend',`<span class="counter-group ${color}" style="width:${size};background-color:${groups[name]};">0</span>`);
        }
        return div;
    },
    create(clazz, i, nom,defaite, argentDepart, montantDepart){
        let id = `joueur${i}`;
        let color = this.colorsJoueurs[i];
        let img = this.imgJoueurs[i];
        let joueur = new clazz(i, nom, color,argentDepart,montantDepart);
        joueur.enPrison = false;
        joueur.defaite = defaite;
        joueur.setEnableMouseFunction(JoueurFactory.mouseFunction);
        const parent = document.querySelector(`.player_${i%2===0?'left':'right'}`)
        const div = document.createElement('div');
        div.id = id;
        if(defaite){
            div.classList.add('defaite');
        }

        div.insertAdjacentHTML('beforeend',`<div class="joueur-bloc"><span class="joueur-id"><span class="joueur-name">${joueur.nom}</span> : <span class="compte-banque"></span> ${CURRENCY}</span><span class="info-joueur" title="Info joueur" data-idjoueur="${i}"><img src="img/info-user2.png" style="cursor:pointer;width:24px;float:right"/></span></div>`)
        div.querySelectorAll('div.joueur-bloc').forEach(d=>d.style.setProperty('background-image', `linear-gradient(to right,white 50%,${color})`));
        div.append(this.displayLineByGroupsAsElement());

        parent.insertAdjacentHTML('beforeend','<hr style="border:solid 2px darkgray"/>');

        parent.append(div);
        joueur.setDiv(div);
        joueur.setPion(color,img,montantDepart);

        bus.send('monopoly.newPlayer', {
            joueur: joueur
        });
        this.joueurs.push(joueur);
        return joueur;
    },
    // Search by numero or playerID
    getByUniqueId(id){
        return this.joueurs.find(j=>j.uniqueID != null && j.uniqueID === id);
    },
    getById(id){
        return this.joueurs.find(j=>j.numero ===parseInt(id) || j.playerID === id);
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
            if(joueur != null && (GestionJoueur.getJoueurCourant() == null || joueur.id !== GestionJoueur.getJoueurCourant().id)) {
                bus.debug({
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
        if(GestionJoueur.getJoueurCourant() == null || joueur.id !== GestionJoueur.getJoueurCourant().id){
            joueur.notifySelect();
            GestionDes.resetDouble();
        }
        this._select(joueur);
    },
    // Renvoie la liste des joueurs disponibles
    getAvailableSlots(){
        return this.joueurs.filter(j=>j.isSlotFree());
    },
    _showVainqueur(gagnant){
        bus.send('monopoly.victoire',{joueur:gagnant});
        // On affiche les resultats complets
        const perdants = this.joueurs.filter(function(j){return j.defaite;});
        perdants.sort((a,b)=>{
            if(a.tourDefaite === b.tourDefaite){
                return b.numero - a.numero;
            }
            return b.tourDefaite - a.tourDefaite;
        });
        let message = `Le joueur ${gagnant.nom} a gagné en ${this._formatTempsJeu(globalStats.heureDebut)}.<br/>`;
        message+=`1 - ${gagnant.nom}<br/>`;

        message+= perdants.map((a,i)=>`${(i+2)} - ${a.nom}`).join("<br/>")
        let score = this._calculateScore(gagnant);
        infoMessage.create(this.joueurCourant,`Fin de partie : ${score} Points`, "green", message, ()=>{}, null, true,{"Recommencer":()=>{
            dialog.close();
                restartMonopoly();
            }});
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
        let time = Math.round((new Date().getTime() - beginTime)/1000);
        if(time < 60){
            return time + " sec";
        }
        const sec = time%60;
        time = Math.round(time/60);
        return `${time} min et ${sec} sec`;
    },
    _select(joueur){
        if(!joueur.canPlay){
            disableActions();
        }else{
            enableActions();
        }
        if(VARIANTES.echangeApresVente && GestionFiche.isFreeFiches()){
            document.getElementById('idEchangeTerrains').setAttribute('disabled','disabled');
            document.getElementById('idEchangeTerrains').classList.add('disabled');
        }
        if (!joueur.equals(this.joueurCourant)) {
            document.querySelectorAll('.joueurCourant').forEach(d=>d.classList.remove('joueurCourant'))
            if(this.joueurCourant!=null && this.joueurCourant.pion !=null){
                this.joueurCourant.pion.pion.setSelected(false);
            }
        }

        this.joueurCourant = joueur;
        this.joueurCourant.pion.pion.setSelected(true);
        joueur.select();
    },
    getWinner() {
        let defaites = 0;
        let gagnantProbable;
        for (let index in this.joueurs) {
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
        let joueur = this.joueurCourant;
        /* Changement de joueur */
        if(!GestionDes.continuePlayer() && !GestionDes.isSpecificAction()){
            let pos = 0;
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
