var EXPORTED_SYMBOLS = ["RosterView", "ContactView", "GroupView",
                        "PresenceProfilesView", "ContactTooltip",
                        "ContactsListView", "ContactsDDHandler", "ResourceTooltip"];

function RosterView(node, matchGroups, negativeMatch)
{
    this.containerNode = node;
    this.items = [];
    this.model = account;
    this.matchGroups = matchGroups || [];
    this.negativeMatch = negativeMatch;

    this.dragHandler = new ContactsDDHandler(this);

    this.onModelUpdated(null, "groups", {added: account.groups});
    this._regToken = this.model.registerView(this.onModelUpdated, this, "groups");
    this._hideOffline = node.getAttribute("hideOffline") == "true";
}

_DECL_(RosterView, null, ContainerView).prototype =
{
    afterLastItemNode: null,
    containerNode: null,

    set hideOffline(val)
    {
        this.containerNode.setAttribute("hideOffline", !!(val && !this._searchTerm));
        this._hideOffline = val;

        return val;
    },

    get hideOffline()
    {
        return this._hideOffline;
    },

    get searchTerm() {
        return this._searchTerm;
    },

    set searchTerm(val) {
        this._searchTerm = val;
        this.hideOffline = this._hideOffline;

        for (var item in this.itemsIterator())
            item.onSearchTermChanged(val);

        return val;
    },

    itemComparator: function(ao, bo)
    {
        var a = 0+ao.model.sortPriority;
        var b = 0+bo.model.sortPriority;

        if (a == b) {
            a = ao.model.visibleName.toLowerCase();
            b = bo.model.visibleName.toLowerCase();
        }

        return a > b ? 1 : a == b ? 0 : -1;
    },

    onModelUpdated: function(model, type, data)
    {
        if (data.added)
            for each (var addedData in data.added)
                if (this.matchGroups.indexOf(addedData) >= 0 ?
                    this.negativeMatch : !this.negativeMatch)
                    this.onItemAdded(new GroupView(addedData, this));

        if (data.removed)
            for each (var removedData in data.removed)
                if (this.matchGroups.indexOf(removedData) >= 0 ?
                    this.negativeMatch : !this.negativeMatch)
                    this.onItemRemoved(removedData);
    },

    destroy: function() {
        this._regToken.unregisterFromAll();
        ContainerView.prototype.destroy.call(this);
    }
}

function GroupView(model, parentView)
{
    default xml namespace = new Namespace(XULNS);

    this.model = model;
    this.parentView = parentView;
    this.root = parentView;
    this.doc = parentView.containerNode.ownerDocument;
    this.contacts = [];

    var open = this.model.name ? // doesn't work !!
               account.cache.getValue("groupExpand-"+this.model.name) != "false" : true;
    this.node = E4XtoDOM(
      <expander open={open} showOffline={this.model == account.myEventsGroup}
                onexpand="this.view.onExpand(val)"
                context="group-contextmenu" class="group-view">
        <description flex="1" class="icons-box"/>
      </expander>
    , this.doc);

    this.box = this.node.getElementsByTagName("description")[0];

    this.node.menuModel = this.model;
    this.node.view = this;

    this.onAvailUpdated();

    this._regToken =
    this.model.registerView(this.onModelUpdated, this, "contacts");
    this.model.registerView(this.onAvailUpdated, this, "availContacts", this._regToken);

    prefManager.registerChangeCallback(new Callback(this.onPrefChange, this),
                                       "chat.roster.sortbystatus", false,
                                       this._regToken);

    this._matchingCount = 0;

    this.node.addEventListener("dragover", this.root.dragHandler, false);
    this.node.addEventListener("dragleave", this.root.dragHandler, false);
    this.node.addEventListener("drop", this.root.dragHandler, false);
}

_DECL_(GroupView, null, ContainerView).prototype =
{
    containerNode: null,

    get afterLastItemNode()
    {
        return null;
    },

    onPrefChange: function(name, value)
    {
        this.onSortMethodChanged();
    },

    itemComparator: function(a, b)
    {
        return a.model.cmp(b.model, prefManager.getPref("chat.roster.sortbystatus"));
    },

    onAvailUpdated: function()
    {
        var name = _("{0} ({1}/{2})", this.model.visibleName,
                     this.model.availContacts, this.model.contacts.length);

        this.node.setAttribute("onlyOfflineContacts",
                               this.model.availContacts == 0);

        this.node.setAttribute("label", name);
    },

    onExpand: function(value)
    {
        if (this.model.name)
            account.cache.setValue("groupExpand-"+this.model.name, !!value);
    },

    onModelUpdated: function(model, type, data, virtual)
    {
        if (!this.items)
            return;

        if (data.added)
            for each (var addedData in data.added)
                this.onItemAdded(new ContactView(addedData, this, virtual));

        if (data.removed)
            for each (var removedData in data.removed)
                this.onItemRemoved(removedData);

        this.onAvailUpdated();
    },

    onSearchTermChanged: function(newValue)
    {
        for (var item in this.itemsIterator())
            item.onSearchTermChanged(newValue);
    },

    onMatchingCountChanged: function(diff)
    {
        this._matchingCount += diff;
        this.node.setAttribute("onlyNonMatchingContacts", this._matchingCount == 0);
    },

    show: function(rootNode, insertBefore)
    {
        this.rootNode = rootNode;
        this.containerNode = this.box;
        rootNode.insertBefore(this.node, insertBefore);

        if (!this.items) {
            this.items = [];
            this.onModelUpdated(this.model, "contacts", {added: this.model.contacts});
        }

        if (this.model == account.myEventsGroup)
            this.animation = Animator.animateStyle({
                element: this.node._container,
                style:"background",
                tick: 100,
                time: 2000,
                loop: true
            }, "transparent", "#ff6", "transparent");
    },

    destroy: function()
    {
        if (this.animation)
            this.animation.stop();

        this._regToken.unregisterFromAll();

        if (!this.items)
            return;

        ContainerView.prototype.destroy.call(this);
        this.rootNode.removeChild(this.node);
    },

    onDragOver: function(contact) {
        if (this.model.contains(contact))
            return;

        if (this.dragLeaveTimeout)
            clearTimeout(this.dragLeaveTimeout);
        this.dragLeaveTimeout = null;

        if (this.dragContact != contact)
            this.onModelUpdated(this.model, null, {added: [contact]}, true);
        this.dragContact = contact;
    },

    onDragLeave: function(contact) {
        if (this.model.contains(contact))
            return;

        var _this = this;
        this.dragLeaveTimeout = setTimeout(function() {
            _this.dragContact = null;
            _this.onItemRemoved(contact);
            _this.dragLeaveTimeout = null
        }, 0);
    },

    onDrop: function(contact, ev) {
        var jid = ev.dataTransfer.getData("text/xmpp-jid");

        if (!contact) {
            account.getOrCreateContact(jid, false, null, [this.model]);
        } else if (ev.dataTransfer.dropEffect == "copy") {
            for (var i = 0; i < contact.groups.length; i++)
                if (contact.groups[i] == this.model)
                    return;
            contact.editContact(contact.name, [this.model].concat(contact.groups));
        } else {
            if (contact.groups.length == 1 && contact.groups[0] == this.model)
                return;

            contact.editContact(contact.name, [this.model]);
        }
    }
}

function ContactView(model, parentView, virtual)
{
    default xml namespace = new Namespace(XULNS);

    this.model = model;
    this.parentView = parentView;
    this.root = parentView.root;
    this.doc = parentView.containerNode.ownerDocument;

    this.virtual = virtual;

    this.tooltip = model instanceof MyResourcesContact ?
                       new ResourceTooltip(model, this.parentView) :
                       new ContactTooltip(model, this.parentView);

    this.node = E4XtoDOM(
      <hbox class={"contact-view"+(virtual ? " virtual" : "")}
            ondblclick="this.model.onDblClick()"
            context={model instanceof MyResourcesContact ?
                     "resource-contextmenu" : "contact-contextmenu"}
            tooltip={this.tooltip.id}>
        <vbox class="icon-container">
          <image class="status-icon"/>
        </vbox>
        <stack flex="1">
          <stack class="label-box" overflowed="false">
            <hbox align="center" pack="center">
              <label value={model.visibleName || model.jid.node}/>
            </hbox>
            <vbox>
              <image/>
            </vbox>
          </stack>
          <vbox class="avatar-box">
            <avatar side="48" squareBordered="true"/>
          </vbox>
          <vbox class="counter-box">
            <vbox>
              <label/>
            </vbox>
          </vbox>
        </stack>
      </hbox>
    , this.doc);

    this.statusIcon = this.node.getElementsByClassName("status-icon")[0];
    this.label = this.node.getElementsByTagName("label")[0];
    this.messagesCounter = this.node.getElementsByTagName("label")[1];
    this.avatar = this.node.getElementsByTagName("avatar")[0];
    this.iconContainer = this.node.getElementsByClassName("icon-container")[0];

    this.messagesCounterContainer = this.messagesCounter.parentNode;

    this.avatar.model = model;

    this.label.parentNode.addEventListener("overflow", function(ev) {
        ev.target.parentNode.setAttribute("overflowed", "true");
    }, true);
    this.label.parentNode.addEventListener("underflow", function(ev) {
        ev.target.parentNode.setAttribute("overflowed", "false");
    }, true);

    this.label.view = this;
    this.node.model = this.model;
    this.node.menuModel = model;
    this.node.view = this;

    this.node.addEventListener("dragstart", this.root.dragHandler, false);
    this.node.addEventListener("dragover", this.root.dragHandler, false);
    this.node.addEventListener("dragleave", this.root.dragHandler, false);
    this.node.addEventListener("drop", this.root.dragHandler, false);

    this._regToken = this.model.registerView(this.onNameChange, this, "name");
    this.model.registerView(this.onActiveResourceChange, this, "activeResource", this._regToken);
    this.model.registerView(this.onMsgsInQueueChanged, this, "msgsInQueue", this._regToken);
    this.model.registerView(this.onAvatarChanged, this, "avatar", this._regToken);
    this.model.registerView(this.onEventsChanged, this, "events", this._regToken);
    account.style.registerView(this.onModelUpdated, this, "defaultSet", this._regToken);

    this._matches = false;

    this.onSearchTermChanged(parentView.parentView.searchTerm);

    this.onActiveResourceChange();
    this.onAvatarChanged();
    this.onEventsChanged();
}

_DECL_(ContactView).prototype =
{
    onEventsChanged: function() {
        if (this.model.events.length && !this.model.msgsInQueue) {
            this.messagesCounter.parentNode.parentNode.
                setAttribute("event", this.model.events[0].type);
        } else
            this.messagesCounter.parentNode.parentNode.removeAttribute("event");
    },

    onNameChange: function()
    {
        this.label.setAttribute("value", this.model.visibleName);

        this.parentView.onItemUpdated(this);
    },

    onActiveResourceChange: function()
    {
        if (this._activeResource)
            this._regToken.unregister(this._activeResource);

        if (this.model.activeResource)
            this.model.activeResource.registerView(this.onModelUpdated, this,
                                                   "presence", this._regToken);

        this.node.setAttribute("offlineContact", this.model.activeResource == null);
        this._activeResource = this.model.activeResource;
        this.onModelUpdated();
    },

    onAvatarChanged: function()
    {
        this.node.setAttribute("hasAvatar", !!(this.model && this.model.avatar));
    },

    onModelUpdated: function()
    {
        this.onMsgsInQueueChanged();

        this.parentView.onItemUpdated(this);
    },

    onMsgsInQueueChanged: function()
    {
        var icon = this.model.getStatusIcon(this.model.msgsInQueue);

        if (this._blinkingTimeout)
            clearInterval(this._blinkingTimeout);
        this._blinkingTimeout = null;

        if (this.model.msgsInQueue) {
            if (icon.length > 1) {
                this._blinkingTimeout = setInterval(function(img, icons, idx) {
                    img.setAttribute("src", icons[idx.idx = (idx.idx+1)%icons.length]);
                }, 500, this.statusIcon, icon, {idx:0});
            }
            icon = icon[0];
        } else
            this.onEventsChanged();

        this.statusIcon.setAttribute("src", icon);

        this.messagesCounter.setAttribute("value", this.model.msgsInQueue);
        this.messagesCounterContainer.hidden = !this.model.msgsInQueue;
    },

    onSearchTermChanged: function(term)
    {
        var matches = true;
        if (term)
            for each (var t in term.toLowerCase().match(/\S+/g)) {
                matches = false;
                for each (var m in [this.model.visibleName, this.model.jid.toUserString()])
                    if (m.toLowerCase().indexOf(t) >= 0) {
                        matches = true;
                        break;
                    }
                if (!matches)
                    break;
            }

        this.node.setAttribute("nonMatchingContact", !matches);

        if (this._matches != matches)
            this.parentView.onMatchingCountChanged(matches ? 1 : -1)

        this._matches = !!matches
    },

    show: function(rootNode, insertBefore)
    {
        rootNode.insertBefore(this.node, insertBefore);
        this.onNameChange()
        this.tooltip.show(this.node, this.node.firstChild);
    },

    destroy: function()
    {
        this.avatar.model = null;

        this.tooltip.destroy();

        if (this.node.parentNode)
            this.node.parentNode.removeChild(this.node);

        if (this._blinkingTimeout)
            clearInterval(this._blinkingTimeout);
        this._blinkingTimeout = null;

        this._regToken.unregisterFromAll();

        if (this._matches)
            this.parentView.onMatchingCountChanged(-1);
    },

    onDrop: function(model, ev) {
      this.parentView.onDrop(model, ev);
    },

    onDragOver: function(c) {
      this.parentView.onDragOver(c);
    },

    onDragLeave: function(c) {
      this.parentView.onDragLeave(c);
    }
}

function ContactTooltip(model, parentView)
{
    default xml namespace = new Namespace(XULNS);

    this.model = model;
    this.parentView = parentView;
    this.doc = parentView.containerNode.ownerDocument;

    this.id = generateUniqueId();
    this.node = E4XtoDOM(
      <tooltip onpopupshowing="this.view.onTooltipShowing()" id={this.id} class="contact-tooltip">
        <hbox flex="1" align="start">
          <grid>
            <columns>
              <column/>
              <column flex="1"/>
            </columns>
            <rows>
              <label class="contact-tooltip-name"/>
              <row>
                <label value={_("Jabber ID:")}/>
                <label value={this.model.jid.toUserString()}/>
              </row>
              <row>
                <label value={_("Subscription:")}/>
                <label/>
              </row>
              <label value={_("Resources:")}/>
              <vbox class="contact-tooltip-resources"/>
            </rows>
          </grid>
          <avatar side="128" squareBordered="false"/>
        </hbox>
      </tooltip>
    , this.doc);

    this.avatar         = this.node.getElementsByTagName("avatar")[0];
    this.subscription   = this.node.getElementsByTagName("label")[4];
    this.resourcesLabel = this.node.getElementsByTagName("label")[5];
    this.name               = this.node.getElementsByClassName("contact-tooltip-name")[0];
    this.resourcesContainer = this.node.getElementsByClassName("contact-tooltip-resources")[0];

    //this.node.model = this.model; // seems to be never used
    this.avatar.model = this.model;
    this.node.view = this;
}

_DECL_(ContactTooltip).prototype =
{
    onTooltipShowing: function()
    {
        default xml namespace = new Namespace(XULNS);

        this.name.setAttribute("value", this.model.visibleName);
        this.subscription.setAttribute("value",
            this.model.subscription == "both" ? _("in two ways") :
            this.model.subscription == "from" ? _("he/she can see your status") :
            this.model.subscription == "to"   ? _("you can see his/her status") :
                                                _("none")
        );

        while (this.resourcesContainer.firstChild)
            this.resourcesContainer.removeChild(this.resourcesContainer.firstChild);

        var firstResource = true;

        for (var resource in this.model.resourcesIterator(null, null, function(a, b){return a.cmp(b, true)})) {
            if (!firstResource)
                this.resourcesContainer.appendChild(this.doc.createElementNS(XULNS, "spacer"));
            firstResource = false;

            this.resourcesContainer.appendChild(E4XtoDOM(
                <hbox align="center">
                  <image src={resource.getStatusIcon()}/>
                  <label class="contact-tooltip-resource-name"
                         value={resource.jid.resource+" ("+resource.presence.priority+")"}/>
                  <label value="-"/>
                  <label class="contact-tooltip-resource-show"
                         value={resource.presence}
                         style={resource.presence.getStyle(resource.msgsInQueue)}/>
                </hbox>
            , this.doc));

            if (resource.presence.status)
                this.resourcesContainer.appendChild(E4XtoDOM(
                    <description class="contact-tooltip-resource-status" crop="end"
                                 value={resource.presence.status}/>
                , this.doc));
        }
        this.resourcesLabel.setAttribute("hidden", firstResource);
    },

    show: function(rootNode, insertBefore)
    {
        rootNode.insertBefore(this.node, insertBefore);
    },

    destroy: function()
    {
        if (this.node.parentNode)
            this.node.parentNode.removeChild(this.node);
    }
}

function ResourceTooltip(model, parentView)
{
    default xml namespace = new Namespace(XULNS);

    this.model = model;
    this.parentView = parentView;
    this.doc = parentView.containerNode.ownerDocument;

    this.id = generateUniqueId();
    this.node = E4XtoDOM(
      <tooltip onpopupshowing="this.view.onTooltipShowing()" id={this.id} class="resource-tooltip">
        <hbox flex="1" align="start">
          <grid>
            <columns>
              <column/>
              <column flex="1"/>
            </columns>
            <rows>
              <hbox class="resource-tooltip-name-container" align="center">
                <image/>
                <label class="resource-tooltip-name"/>
                <label value="-"/>
                <label class="resource-tooltip-resource-show"/>
              </hbox>
              <row>
                <label value={_('Jabber ID:')}/>
                <label value={this.model.jid}/>
              </row>
              <description class="resource-tooltip-resource-status" style="margin-left: 1em;"/>
            </rows>
          </grid>
          <avatar side="128" squareBordered="false"/>
        </hbox>
      </tooltip>
    , this.doc);

    this.icon   = this.node.getElementsByTagName("image")[0];
    this.avatar = this.node.getElementsByTagName("avatar")[0];
    this.name      = this.node.getElementsByClassName("resource-tooltip-name")[0];
    this.showLabel = this.node.getElementsByClassName("resource-tooltip-resource-show")[0];
    this.status    = this.node.getElementsByClassName("resource-tooltip-resource-status")[0];

    //this.node.model = this.model; // seems to be never used
    this.avatar.model = this.model;
    this.node.view = this;
}

_DECL_(ResourceTooltip).prototype =
{
    onTooltipShowing: function()
    {
        this.name.setAttribute("value", _("{0} ({1})", this.model.visibleName,
                                          this.model.activeResource.presence.priority || 0));
        this.icon.setAttribute("src", this.model.activeResource.getStatusIcon());
        this.showLabel.setAttribute("value", this.model.activeResource.presence);
        this.showLabel.setAttribute("style", this.model.activeResource.presence.
                                    getStyle(this.model.activeResource.msgsInQueue));
        this.status.setAttribute("value", this.model.activeResource.presence.status);
    },

    show: function(rootNode, insertBefore)
    {
        rootNode.insertBefore(this.node, insertBefore);
    },

    destroy: function()
    {
        if (this.node.parentNode)
            this.node.parentNode.removeChild(this.node);
    }
}

function ContactsListView(containerNode, model, field, flags)
{
    var doc = containerNode.ownerDocument;

    this.model = model;
    this.containerNode = containerNode;
    this.items = [];
    this.flags = flags;

    this.node = doc.createElementNS(XULNS, "richlistitem");

    this.node.setAttribute("class", "conference-view");
    this.node.model = this.model;
    this.node.menuModel = model;
    this.node.view = this;

    this.onModelUpdated(model, field, {added: model[field]})

    this._token = this.model.registerView(this.onModelUpdated, this, field);
}

_DECL_(ContactsListView, null, ContainerView).prototype =
{
    containerNode: null,
    afterLastItemNode: null,

    _getItemName: function(model) {
        var field = this._getItemNameField(model);

        return field ? model[field] : model;
    },

    _getItemNameField: function(model) {
        if (typeof(model) == "string")
            return null;
        if (model instanceof Conference)
            return "name";

        return "visibleName";
    },

    itemComparator: function(a, b, m, s, e)
    {
        var aVal = this._getItemName(a.model).toLowerCase();
        var bVal = this._getItemName(b.model).toLowerCase();

        return aVal.localeCompare(b.Val);
    },

    onModelUpdated: function(model, type, data)
    {
        if (data.added)
            for each (var addedData in data.added)
                this.onItemAdded(new ContactsListItemView(addedData,
                                 this, this.node.ownerDocument, this.flags));

        if (data.removed)
            for each (var removedData in data.removed)
                this.onItemRemoved(removedData);
    },

    destroy: function()
    {
        ContainerView.prototype.destroy.call(this);
        this.model.unregisterView(this._token);
    }
}

function ContactsListItemView(model, parentView, doc, flags)
{
    this.model = model;
    this.parentView = parentView;

    this.node = doc.createElementNS(XULNS, "richlistitem");
    this.label = doc.createElementNS(XULNS, "label");
    if (flags.displayAvatar) {
        this.avatar = doc.createElementNS(XULNS, "avatar");
        this.avatar.model = this.model;
        this.avatar.setAttribute("showBlankAvatar", "true")
        this.node.appendChild(this.avatar);
    }

    this.node.setAttribute("class", "conferencemember-view");
    this.label.setAttribute("value", this.parentView._getItemName(model));
    this.label.setAttribute("flex", "1");
    this.label.setAttribute("crop", "end");

    this.node.model = this.model;
    this.node.menuModel = model;
    this.node.view = this;

    this.node.appendChild(this.label);

    var field = this.parentView._getItemNameField(model);
    if (field)
        this._regToken = this.model.registerView(this.onNameChange, this, field);
}

_DECL_(ContactsListItemView).prototype =
{
    onNameChange: function()
    {
        this.label.value = this.parentView._getItemName(model);
        this.parentView.onItemUpdated(this);
    },

    show: function(rootNode, insertBefore)
    {
        rootNode.insertBefore(this.node, insertBefore);
    },

    destroy: function()
    {
        if (this.avatar)
            this.avatar.model = null;

        if (this.node.parentNode)
            this.node.parentNode.removeChild(this.node);

        if (this._regToken)
            this._regToken.unregister();
    }
}

function PresenceProfilesView(node, checkbox)
{
    this.containerNode = node.parentNode;
    this.doc = node.ownerDocument;
    this.dummyNode = node;
    this.afterLastItemNode = node.nextSibling;
    this.items = [];
    this.model = account.presenceProfiles;
    this.checkbox = checkbox;

    this.onModelUpdated(null, "profiles", {added: this.model.profiles});
    this._regToken = this.model.registerView(this.onModelUpdated, this, "profiles");
}

_DECL_(PresenceProfilesView, null, ContainerView).prototype =
{
    afterLastItemNode: null,
    containerNode: null,

    itemComparator: function(a, b)
    {
        a = a.model.name.toLowerCase();
        b = b.model.name.toLowerCase();

        return a > b ? -1 : a == b ? 0 : 1;
    },

    onModelUpdated: function(model, type, data)
    {
        if (data.added)
            for each (var addedData in data.added)
                this.onItemAdded(new PresenceProfileView(addedData, this));

        if (data.removed)
            for each (var removedData in data.removed)
                this.onItemRemoved(removedData);

        if (this.model.profiles.length == 0) {
            this.containerNode.insertBefore(this.dummyNode, this.afterLastItemNode);
            this.containerNode.parentNode.selectedIndex = 0;
            this.checkbox.disabled = true;
        } else if (this.dummyNode.parentNode) {
            this.containerNode.removeChild(this.dummyNode);
            this.containerNode.parentNode.selectedIndex = 0;
            this.checkbox.disabled = false;
        }
    },

    destroy: function() {
        ContainerView.prototype.destroy.call(this);
        this.model.unregisterView(this._regToken);
    }
}

function PresenceProfileView(model, parentView)
{
    this.model = model;
    this.parentView = parentView;

    var doc = this.parentView.doc;

    this.node = doc.createElementNS(XULNS, "menuitem");

    this.node.setAttribute("class", "setPresence-profile-view");
    this.node.setAttribute("label", model.name);
    this.node.setAttribute("value", "presenceProfile-"+(PresenceProfileView.prototype._id++));

    this.node.model = this.model;
    this.node.view = this;

    this._token = this.model.registerView(this.onNameChange, this, "name");
}

_DECL_(PresenceProfileView).prototype =
{
    _id: 0,

    onNameChange: function()
    {
        this.node.setAttribute("label", this.model.bookmarkName);
        this.parentView.onItemUpdated(this);
    },

    show: function(rootNode, insertBefore)
    {
        rootNode.insertBefore(this.node, insertBefore);
    },

    destroy: function()
    {
        if (this.node.parentNode)
            this.node.parentNode.removeChild(this.node);

        this.model.unregisterView(this._token);
    }
}

function ContactsDDHandler(root) {
    this.root = root;

    this.defaultAvatar = root.containerNode.ownerDocument.createElementNS(HTMLNS, "img");
    this.defaultAvatar.src = defaultAvatar;
}

_DECL_(ContactsDDHandler).prototype =
{
    handleEvent: function(ev) {
        var view = ev.currentTarget.view;

        if (ev.type == "dragstart") {
            ev.dataTransfer.setData("text/uri-list", "xmpp:"+view.model.jid);
            ev.dataTransfer.setData("text/xmpp-jid", view.model.jid);
            ev.dataTransfer.setData("text/plain", view.model.visibleName);
            ev.dataTransfer.effectAllowed = "copyMove";
            this.createDragImage(ev, view);

            return;
        }

        if (!ev.dataTransfer.types.contains("text/xmpp-jid"))
            return;

        var model = this.getModelForEv(ev);

        if (ev.type == "dragover") {
            var l = view.root.containerNode, r;

            if (l._scrollbox)
                l = l._scrollbox;

            r = l.getBoundingClientRect();

            if (r.top > ev.clientY - 30 && l.scrollTop > 0) {
                this.scrollDir = 1;
                this.animScroll();
            } else if (r.bottom < ev.clientY + 30 && l.scrollTop+l.clientHeight < l.scrollHeight) {
                this.scrollDir = -1;
                this.animScroll();
            } else
                this.scrollDir = 0;

            if (view.onDragOver)
                view.onDragOver(model);
        } else if (ev.type == "dragleave") {
            this.scrollDir = 0;
            if (view.onDragLeave)
                view.onDragLeave(model);
        } else if (ev.type == "drop") {
            this.scrollDir = 0;

            if (view.onDragLeave)
                view.onDragLeave(model);
            view.onDrop(model, ev);
        }

        ev.preventDefault();
    },

    getModelForEv: function(ev) {
        var jid = ev.dataTransfer.getData("text/xmpp-jid");
        var contact = account.getContactOrResource(jid);

        if (!contact)
            return account.getOrCreateContact(jid, false, null, [this.model]);

        return contact;
    },

    animScroll: function() {
        if (!this.scrollDir || (this._anim && this._anim.running))
            return;

        var l = this.root.containerNode._scrollbox;

        this._anim = Animator.animateScroll({
            element: l,
            time: 200,
            stopCallback: new Callback(this.animScroll, this)
        }, 0, l.scrollTop + (this.scrollDir < 0 ? 30 : -30));
    },

    createRoundedRectPath: function(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.save();
        ctx.translate(x, y);
        ctx.moveTo(r, 0);
        ctx.lineTo(w-r, 0);
        ctx.arc(w-r, r, r, 3*Math.PI/2, Math.PI*2);
        ctx.lineTo(w, h-r);
        ctx.arc(w-r, h-r, r, Math.PI*2, Math.PI/2);
        ctx.lineTo(r, h);
        ctx.arc(r, h-r, r, Math.PI/2, Math.PI);
        ctx.lineTo(0, r);
        ctx.arc(r, r, r, Math.PI, 3*Math.PI/2);
        ctx.closePath();
        ctx.restore();
    },

    createDragImage: function(event, view) {
        var canvas = view.node.ownerDocument.createElementNS(HTMLNS, "canvas");

        var ctx = canvas.getContext("2d");
        var txt = view.model.visibleName;
        var tw;

        var s = view.label.ownerDocument.defaultView.getComputedStyle(view.label, "");

        ctx.font = s.fontSize+" "+s.fontFamily;

        tw = ctx.measureText(txt).width;
        var ft = true;

        while (tw > 500) {
            if (ft)
                txt = txt.substr(0, txt.length-1);
            else
                txt = txt.substr(0, txt.length-4);
            ft = false;
            txt += "...";
            tw = ctx.measureText(txt).width;
        }

        canvas.width = 44 + tw;
        canvas.height = 40;
        ctx.font = s.fontSize+" "+s.fontFamily;

        this.createRoundedRectPath(ctx, 0.5, 0.5, 38, 38, 5);
        ctx.fillStyle = "#444";
        ctx.stroke();

        ctx.fillStyle = "white";
        ctx.fill();

        var image = view.avatar._imageObj.width ?
          view.avatar._imageObj : this.defaultAvatar;

        var iw = image.width;
        var ih = image.height;
        var idiv = iw > ih ? 1/iw : 1/ih;

        ctx.drawImage(image, 2, 2+18*(1-ih*idiv), 36*iw*idiv, 36*ih*idiv);

        ctx.textBaseline = "middle";
        ctx.fillStyle = "black";
        ctx.fillText(txt, 44, 20);

        event.dataTransfer.setDragImage(canvas, 20, 20);
    }
}
