/* Gestion des encheres et des echanges entre joueurs */

/* Gestion d'une mise aux enchere d'un terrain */
/* Empecher un joueur d'acquerir un terrain ? */
var GestionEnchere = {
    terrain: null,
    callback: null,
    miseDepart: 0,
    ventePerte: false,
    pasVente: 2000,
    joueurLastEnchere: null,
    lastEnchere: 0,
    nextMontantEnchere: 0,
    currentJeton: 0,
    joueursExit: [],
    endAckJoueurs: [], // Liste des joueurs ayant accuse de la fin des encheres
    transaction: 0, // Permet d'authentifier la transaction

    /* Initialise une mise aux enchere */
    /* @param miseDepart : prix de depart */
    /* @param ventePerte : si vrai, permet de baisser la mise de depart (cas d'une vente obligee pour payer une dette) */
    init: function (terrain, miseDepart, ventePerte, callback) {
      this.pasVente = InitMonopoly.plateau.infos.montantDepart / 10;
        this.terrain = terrain;
        this.callback = callback;
        this.miseDepart = miseDepart;
        this.lastEnchere = 0;
        this.endAckJoueurs = [];
        this.nextMontantEnchere = miseDepart;
        this.ventePerte = ventePerte;
        this.joueurLastEnchere = null;
        this.currentJeton = 0;
        this.joueursExit = [];
        this.transaction++;
        $.trigger('monopoly.enchere.init', {
            maison: this.terrain,
            joueur: this.terrain.joueurPossede
        });

        GestionJoueur.forEach(function(j){j.initEnchere(this.transaction, this.terrain, this.miseDepart)},this);
        this.runEnchere();
    },
    computeEncherisseurs: function () {
        var encherisseurs = [];
        var observers = [];
        // exclure les joueurs qui ont perdus
		GestionJoueur.forEach(function(j){
			if (!j.equals(this.terrain.joueurPossede) && !j.equals(this.joueurLastEnchere) && this.joueursExit[j.nom] == null && j.defaite == false) {
                encherisseurs.push(j);
            } else {
                observers.push(j);
            }
		},this);
        return {
            encherisseurs: encherisseurs,
            observers: observers
        };
    },
    /* On lance aux joueurs les encheres, le premier qui repond prend la main, on relance a chaque fois (et on invalide le resultat des autres) */
	/* @param newEnchere : quand l'enchere, on notifie les joueurs (ca peut les interesse) */
    runEnchere: function (newEnchere) {
        var joueurs = this.computeEncherisseurs();
        for (var i = 0; i < joueurs.encherisseurs.length; i++) {
            joueurs.encherisseurs[i].updateEnchere(this.transaction, this.currentJeton, this.nextMontantEnchere, this.joueurLastEnchere,newEnchere);
        }
        for (var i = 0; i < joueurs.observers.length; i++) {
            joueurs.observers[i].updateInfoEnchere(this.nextMontantEnchere, this.joueurLastEnchere);
        }
    },
    /* Appele par un joueur  */
    exitEnchere: function (joueur) {
		if(this.joueursExit[joueur.nom] != null){return;}
        this.joueursExit[joueur.nom] = joueur;
        GestionJoueur.forEach(function(j){j.notifyExitEnchere(joueur)});
        /*for (var j in joueurs) {
            joueurs[j].notifyExitEnchere(joueur);
        }*/
        if (this.checkEndEnchere()) {
            this.manageEndEnchere();
        }
    },
	/* Verifie si l'enchere est terminee */
    checkEndEnchere: function () {
        // 1) Vente par banque, pas d'enchere
		// 2) Vente par joueur, pas d'enchere ou vente par banque avec une enchere
		// 3) Vente par joueur avec enchere
        if (this.joueursExit.size() >= GestionJoueur.getNb() || 
			(this.joueursExit.size() >= GestionJoueur.getNb() - 1 && (this.terrain.joueurPossede != null ||this.joueurLastEnchere !=null)) || 
			(this.joueursExit.size() >= GestionJoueur.getNb() - 2 && this.joueurLastEnchere != null && this.terrain.joueurPossede != null)
			) {
            return true;
        }
        return false;
    },
    /* Methode appelee par un joueur pour valider une enchere, le premier invalide les autres */
    doEnchere: function (joueur, montant, jeton) {
        if (jeton < this.currentJeton) {
            // Demande non prise en compte
            throw "Trop lent, une enchere a deja ete faite";
        }
        // On empeche un meme joueur d'encherir sur son offre
        if (joueur.equals(this.joueurLastEnchere)) {
            return;
        }
        this.currentJeton++;
        this.joueurLastEnchere = joueur;
        this.lastEnchere = montant;
        this.nextMontantEnchere = this.lastEnchere + this.pasVente;
        // Si c'est le dernier joueur qui fait une enchere, on doit arreter le joueur
        if (this.checkEndEnchere()) {
            this.manageEndEnchere();
        } else {
            this.runEnchere();
        }
    },
    checkEnchere: function (jeton) {
        if (jeton >= this.currentJeton) {
            // Pas d'enchere, la derniere est la bonne
            this.manageEndEnchere();
        } else {
            // Rien, gestion autonome
        }
    },
    manageEndEnchere: function () {
        if (this.joueurLastEnchere == null) {
            // On relance les encheres en diminuant la mise de depart
            if (this.ventePerte && (this.nextMontantEnchere -  this.pasVente) > this.miseDepart / 2) {
                this.nextMontantEnchere -= this.pasVente;
				// On force les joueurs a reparticiper (le nouveau tarif peut interesser)
				this.joueursExit = [];
                this.runEnchere(true);
            } else {
                //pas de vente
                $.trigger('monopoly.enchere.fail', {
                    maison: this.terrain
                });
                this.endEnchere();
            }

        } else {
            // La mise aux encheres est terminee, on procede a l'echange
            // Correspond a un terrain
            if(this.terrain.joueurPossede == null){
				this.joueurLastEnchere.acheteMaison(this.terrain,this.lastEnchere);
            }
            else{
                this.joueurLastEnchere.payerTo(this.lastEnchere, this.terrain.joueurPossede);
                this.joueurLastEnchere.getSwapProperiete(this.terrain);
            }
            
            $.trigger('monopoly.enchere.success', {
                joueur: this.joueurLastEnchere,
                maison: this.terrain,
				montant:this.lastEnchere
            });

            this.endEnchere();
        }
    },
    endEnchere: function () {
        this.terrain = null;
        // On notifie les joueurs que c'est termine
        GestionJoueur.forEach(function(j){j.endEnchere(this.lastEnchere, this.joueurLastEnchere)},this);
        /*for (var j in joueurs) {
            joueurs[j].endEnchere(this.lastEnchere, this.joueurLastEnchere);
        }*/
    },
    /* Enregistre les joueurs qui accusent reception. Quand tous ont repondu, on lance le callback */
    checkEndNotify: function (joueur) {
        this.endAckJoueurs[joueur.numero] = true;
        if (this.endAckJoueurs.size() >= GestionJoueur.getNb()) {
            this.doCallback();
        }
    },
    doCallback: function () {
        if (this.callback) {
            this.callback();
        }
    }
}

var GestionEnchereDisplayer = {
    panel: null,
    currentMontant: 0,
    currentEncherisseur: null,
    terrain: null,
    displayer: null, // Joueur qui affiche le panneau
    init: function (id) {
        this.panel = $('#' + id);
        this.panel.dialog({
            title: 'Mise au enchere',
            autoOpen: false
        });
    },
    display: function (terrain, joueur) {
        this.terrain = terrain;
        this.displayer = joueur;
        $('.proprietaire', this.panel).text(terrain.joueurPossede !=null ? terrain.joueurPossede.nom : 'Banque');
        $('.terrain', this.panel).text(terrain.nom).css('color', terrain.color);
        $('.list_exit', this.panel).empty();
        $('.list_encherisseurs', this.panel).empty();
		$('.messages', this.panel).empty();
        this.panel.dialog('open');
    },
    /* Affiche l'option pour fermer le panneau */
    displayCloseOption: function (montant, joueur) {
        if (joueur != null) {
            // On affiche la victoire du joueur (derniere enchere faite)
            $('.montant', this.panel).text(montant);
            $('.montant', this.panel).css('color', 'green');
            $('.last_encherisseur', this.panel).text(joueur.nom);

            if (joueur.equals(this.displayer)) {
                // Message pour le joueur qui a remporte
                $('.messages', this.panel).append('Vous avez remporté l\'enchère');
            } else {
                $('.messages', this.panel).append(joueur.nom + ' a remporté l\'enchère');
            }
        } else {
            $('.montant', this.panel).css('color', 'red');
        }
        this.panel.dialog('option', 'buttons', [{
            text: 'Fermer',
            click: function () {
                GestionEnchereDisplayer.close();
            }
        }]);

    },
	/* Nettoie l'affichage */
	clean:function(){
		$('.list_exit', this.panel).empty();
	},
    /* Affiche le depart d'un joueur des encheres */
    showJoueurExit: function (joueur) {
        $('.list_exit', this.panel).append(joueur.nom + ' est sorti<br/>');
    },
    exitEnchere: function () {
        // On supprime les boutons
        this.panel.dialog('option', 'buttons', []);
    },
    close: function () {
        GestionEnchere.doCallback();
        this.panel.dialog('close');
    },
    /* Si canDoEnchere est vrai, le contexte doit etre present */
    updateInfo: function (montant, encherisseur, canDoEnchere, contexte) {
	    if (canDoEnchere && contexte == null) {
            throw "Impossible de gerer l'enchere";
        }
        if (this.currentMontant != null && this.currentEncherisseur != null) {
            $('.list_encherisseurs', this.panel).prepend('<p>' + CURRENCY + ' ' + this.currentMontant + ' : ' + this.currentEncherisseur.nom + '</p>');
            $('.list_encherisseurs > p:gt(3)', this.panel).remove();
        }
        this.currentMontant = montant;
        this.currentEncherisseur = encherisseur;

        $('.montant', this.panel).text(montant);
        $('.montant', this.panel).animate({
            color: 'red'
        }, 200).animate({
            color: 'black'
        }, 2000);
        if (encherisseur != null) {
            $('.last_encherisseur', this.panel).text(encherisseur.nom);
        }
        if (canDoEnchere) {
            // On affiche les boutons pour encherir ou quitter
            var buttons = [{
                text: 'Encherir',
                click: function () {
                    GestionEnchere.doEnchere(GestionEnchereDisplayer.displayer, montant, contexte.jeton);
                }
            }, {
                text: 'Quitter',
                click: function () {
                    GestionEnchere.exitEnchere(GestionEnchereDisplayer.displayer);
                }
            }];
            this.panel.dialog('option', 'buttons', buttons);
        } else {
            this.panel.dialog('option', 'buttons', []);
        }
    }
}

/* Panneau d'echange */
var EchangeDisplayer = {
    panel: null,
    selectJoueurs: null,
    listTerrainsJoueur: null,
    listTerrainsAdversaire: null,
    joueur: null,
    init: function (id, idSelectJoueurs, idListTerrainsJoueur, idListTerrainsAdversaire) {
        this.panel = $('#' + id);
        this.selectJoueurs = $('#' + idSelectJoueurs);
        this.listTerrainsJoueur = $('#' + idListTerrainsJoueur);
        this.listTerrainsAdversaire = $('#' + idListTerrainsAdversaire);

        this.panel.dialog({
            title: "Echange de terrains",
            autoOpen: false,
            width: 400,
            buttons: {
                "Annuler": function () {
                    EchangeDisplayer.close();
                },
                "Proposer": function () {
                    EchangeDisplayer.propose();
                }
            }
        });
        // On charge les joueurs
		GestionJoueur.forEach(function(j){this.selectJoueurs.append('<option value="' + j.id + '">' + j.nom + '</option>');},this)
        this.selectJoueurs.change(function () {
            $('option:not(:first),optgroup', EchangeDisplayer.listTerrainsAdversaire).remove();
            var joueur = GestionJoueur.getById(EchangeDisplayer.selectJoueurs.val());
            if (joueur != null) {
                var groups = joueur.getMaisonsGrouped();
                for (var g in groups) {
                    var group = groups[g];
                    var optionGroup = $('<optgroup label="Groupe ' + group.groupe + '" style="color:' + group.color + '"></optGroup>');
                    for (var f in group.terrains) {
                        var fiche = group.terrains[f];
                        optionGroup.append('<option value="' + fiche.id + '">' + fiche.nom + '</option>');
                    }
                    EchangeDisplayer.listTerrainsAdversaire.append(optionGroup);
                }
            }
        });
    },
    open: function (joueur) {
        this.joueur = joueur;
        // On cache le joueur qui a ouvert le panneau
        this.selectJoueurs.find('option:not(:visible)').show();
        this.selectJoueurs.find('option[value="' + joueur.id + '"]').hide();

        // Affichage des terrains du joueur
        this.listTerrainsJoueur.empty();
        var groups = joueur.getMaisonsGrouped();
        for (var g in groups) {
            // ne pas affiche si construit )groups[g].isConstructed()
            var group = groups[g];
            var div = $('<div style="font-weight:bold;color:' + group.color + '">Groupe ' + group.groupe + '<br/></div>');
            for (var f in group.terrains) {
                var fiche = group.terrains[f];
                div.append('<input type="checkbox" value="' + fiche.id + '" id="chk_id_' + fiche.id + '"/><label for="chk_id_' + fiche.id + '">' + fiche.nom + '</label><br/>');
            }
            EchangeDisplayer.listTerrainsJoueur.append(div);
        }
        this.panel.dialog('open');
    },
    propose: function () {
        var proprietaire = GestionJoueur.getById(EchangeDisplayer.selectJoueurs.val());
        var terrain = GestionFiche.getById(this.listTerrainsAdversaire.val());
        //var terrain = getFicheById(this.listTerrainsAdversaire.val());
        if (proprietaire == null || terrain == null) {
            return;
        }
        // L'action de fin, c'est la reprise du jeu par le joueur (donc rien)
        GestionEchange.init(this.joueur, proprietaire, terrain, null);
        // On recupere la proposition
        var proposition = {
            terrains: [],
            compensation: 0
        };
        $(':checkbox:checked', this.listTerrainsJoueur).each(function () {
            proposition.terrains.push(GestionFiche.getById($(this).val()));
        });
        if ($('#idArgentProposition').val() != "") {
            proposition.compensation = parseInt($('#idArgentProposition').val());
        }
        this.close();
        CommunicationDisplayer.showPropose(this.joueur, proprietaire, terrain, proposition, this.joueur);
        GestionEchange.propose(proposition);
    },
    close: function () {
        this.panel.dialog('close');
        $('option', this.selectJoueurs).removeAttr('selected');
    }
}

/* Gere l'echange d'une propriete entre deux joueurs */
var GestionEchange = {
    running: false,
    /* Indique qu'un echange est en cours, la partie est bloquee */
    demandeur: null,
    proprietaire: null,
    terrain: null,
    proposition: null,
	initialProposition: null,
    /* Derniere proposition faite. */
    endCallback: null,
    /* Methode appelee a la fin de la transaction */
    /* Initialise une transaction entre deux joueurs */
    init: function (demandeur, proprietaire, terrain, endCallback) {
        if (this.running) {
            throw "Transaction impossible, une transaction est deja en cours.";
        }
        this.running = true;
        this.demandeur = demandeur;
        this.proprietaire = proprietaire;
        this.terrain = terrain;
        this.endCallback = endCallback;
        $.trigger('monopoly.echange.init', {
            joueur: demandeur,
            maison: terrain
        });
    },
    /* Termine la transaction entre deux personnes */
    end: function () {
        this.running = false;
        this.demandeur = null;
        this.proprietaire = null;
        this.terrain = null;
        if (this.endCallback != null) {
            this.endCallback();
        }
        this.endCallback = null;
    },
    /* Fait une proposition au proprietaire */
    /* Une proposition peut etre un ou plusieurs terrains ou de l'argent. */
    propose: function (proposition) {
        // On transmet la demande au proprietaire
        this.proposition = proposition;
		this.initialProposition = proposition;
        $.trigger('monopoly.echange.propose', {
            joueur: GestionEchange.demandeur,
            proposition: proposition
        });
        this.proprietaire.traiteRequeteEchange(this.demandeur, this.terrain, proposition);
    },
    /* Contre proposition du proprietaire, ca peut être des terrains ou de l'argent */
    contrePropose: function (proposition, joueurContre) {
        $.trigger('monopoly.echange.contrepropose', {
            joueur: this.proprietaire,
            proposition: proposition
        });
        this.proposition = proposition;
        if (joueurContre.equals(this.demandeur)) {
            this.proprietaire.traiteContreProposition(proposition, joueurContre, this.terrain);
        } else {
            this.demandeur.traiteContreProposition(proposition, joueurContre, this.terrain);
        }
    },
    abort: function () {
        this.end();
    },
    /* Le proprietaire accepte la proposition. On prend la derniere proposition et on l'applique */
    /* @param joueurAccept : joueur qui accepte la proposition (suite au aller retour) */
    accept: function (joueurAccept) {
        $.trigger('monopoly.echange.accept', {
            joueur: joueurAccept
        });
        // On notifie a l'autre joueur que c'est accepte
        if (joueurAccept.equals(this.demandeur)) {
            this.proprietaire.notifyAcceptProposition(function () {
                GestionEchange._doAccept();
            });
        } else {
            this.demandeur.notifyAcceptProposition(function () {
                GestionEchange._doAccept();
            });
        }
    },
    _doAccept: function () {
        // La propriete change de proprietaire
        this.demandeur.getSwapProperiete(this.terrain);
        // Le proprietaire recoit la proposition
        if (this.proposition.compensation != null) {
            this.demandeur.payerTo(this.proposition.compensation, this.proprietaire);
        }
        if (this.proposition.terrains != null && this.proposition.terrains.length > 0) {
            for (var t in this.proposition.terrains) {
                this.proprietaire.getSwapProperiete(this.proposition.terrains[t]);
            }
        }
        this.end();
    },
    reject: function (joueurReject) {
        $.trigger('monopoly.echange.reject', {
            joueur: joueurReject
        });
        // On notifie le joueur et on lui donne le callback(end) pour lancer la suite du traitement
		// Cas de la contreproposition
        if (joueurReject.equals(this.demandeur)) {            
			this.proprietaire.notifyRejectProposition(function () {
                GestionEchange.end();
            }, this.terrain, this.initialProposition);			
        } else {
            this.demandeur.notifyRejectProposition(function () {
                GestionEchange.end();
            }, this.terrain, this.proposition);
        }
    }
}