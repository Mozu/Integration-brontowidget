require([
  'hyprlivecontext',
  'underscore',
  'modules/jquery-mozu',
  'modules/backbone-mozu',
  'modules/api',
  'modules/models-cart'
],
function (HyprLiveContext, _, $, Backbone, api,CartModels) {

//shippingAddress = "SHIPPING_INFO"
//shippingInfo = "SHIPPING_METHOD"
//paymentInfo = "PAYMENT"

 var brontoCartWidget = {
    isCart : false,
    phases: {
      SHOPPING : "SHOPPING",
      SHIPPING_ADDRESS : "SHIPPING_INFO",
      SHIPPING_INFO : "SHIPPING_METHOD",
      PAYMENT_INFO : "PAYMENT",
      ORDER_REVIEW : "ORDER_REVIEW",
      ORDER_COMPLETE : "ORDER_COMPLETE"
    },
    init: function(pageContext){
      var user = require.mozuData('user');
      var self = this;

      if(pageContext)
        this.pageContext = pageContext;

      function build(){
        self.getOrderOrCart().then(function(order){
          //set global variable, this must match variable set
          //as 'shadowdiv' in Bronto Admin
         self._mapToBrontoCart(order, user).then(function(brCart){
          //if(!brCart.lineItems.length)
           // return;
          window.brontoCart = brCart;

          //load bronto's script
          self._getBrontoScript();

          //if checkout set listeners to backbone order object
          if(self._getPageContext().pageType == "checkout"){
            if(window.order && window.order instanceof Backbone.Model){
              window.order.on('change', function(model){
                var changedAttributes = model.changedAttributes();
                if(changedAttributes && changedAttributes.isReady)
                  self.updateCartPhase(self.phases.ORDER_REVIEW);
                else
                  self.updateCartPhase(self.getCheckoutCartPhase());
              });
            }
          }
         }, function(e){
            console.log('Bronto cart widget error getting cart.', e);
         });
        });
      }
      //if checkout page, settimeout for checkout.js to finish
      if(this._getPageContext().pageType == "checkout")
        setTimeout(build, 2000);
      else
        build();

      if (self.isCart) {
        setTimeout(function() {
          var cartModel = window.cartView.cartView.model;

          cartModel.on('sync', function() {
            console.log("cartChanged");
              build();
          });
        }, 2000);
      }
    },
    getCheckoutCartPhase:function(){
      var currentPhase, stepKeys = _.keys(window.checkoutViews.steps);
      var currentKey = _.find(stepKeys, function(stepKey){
        return window.checkoutViews.steps[stepKey].model._stepStatus != "complete";
      });

      if(currentKey){
        switch(currentKey){
          case "shippingAddress":
            currentPhase = this.phases.SHIPPING_ADDRESS;
            break;
          case "shippingInfo":
            currentPhase = this.phases.SHIPPING_INFO;
            break;
          case "paymentInfo":
            currentPhase = this.phases.PAYMENT_INFO;
            break;
          default:
            currentPhase = "";
            break;
        }
      } else{
        currentPhase = this.phases.ORDER_REVIEW;
      }

      return currentPhase;
    },
    updateCartPhase: function(cartPhase){
      console.log(cartPhase + ' updated');
      window.brontoCart.cartPhase = cartPhase;
    },
    getOrderOrCart: function(){
      var deferred = $.Deferred();
      var pageType = this._getPageContext().pageType;

      var order;

      if(pageType == "checkout"){
        order = require.mozuData('checkout');
      } else if(pageType == "confirmation"){
        order = require.mozuData('order');
      }

      if(!order)
        api.get('cart').then(function(cartResponse){
            this.isCart = true;
            cartResponse.data.originalCartId = cartResponse.data.id;
          deferred.resolve(cartResponse.data);
        }, function(e){
          deferred.reject(e);
        });
      else
        deferred.resolve(order);

      return deferred.promise();
    },
    _getBrontoScript: function(){
      var scriptString = $('[data-bronto-loadjs]').data('bronto-loadjs');
      if(scriptString)
        $('head').append(scriptString);
      else
        console.log('No bronto script found for conversion tracking, please check widget configuration.');
    },
    _getPageContext: function(){
      if(!this.pageContext)
        this.pageContext = require.mozuData('pagecontext');

      return this.pageContext;
    },
    _getCartPhase: function(){
      var cartPhase = "SHOPPING";
      var pageType = this._getPageContext().pageType;

      if(pageType == "checkout"){
        cartPhase = this.getCheckoutCartPhase();
      } else if(pageType == "confirmation"){
        cartPhase = this.phases.ORDER_COMPLETE;
      }
      console.log('get cart phase ' + cartPhase);
      return cartPhase;
    },
    _getCategories: function(ids) {
      var deferred = $.Deferred();


      var filter = "";
      _.each(ids, function(id) {
        if (filter)
          filter += " or ";
        filter += "categoryId eq "+id;
      });
      api.get("categories",filter).then(function(categoryResponse){
        deferred.resolve(categoryResponse.data);
      }, function(e){
        deferred.reject(e);
      });
      return deferred.promise();
    },
    _getParentCategories: function(parent, ids) {
      var self = this;
      if (!_.contains(ids, parent.id)) {
          ids.push(parent.id);
      }

      if (parent.parent) {
           ids = self._getParentCategories(parent.parent, ids);
      }
       return ids;
    },
    _getCategoryIds: function(categories, ids) {
      var self = this;
      _.each(categories, function(category) {

        if (category && !_.find(ids, function(id) { return category.id == id;})) {
          ids.push(category.id);
          if (category.parent)
            ids = self._getParentCategories(category.parent, ids);
        }
      });
      return ids;
    },
    _getCategoryMap: function(categories, productCategory, str) {
      var self = this;
      if (!productCategory) return;
      var category = _.find(categories, function(category) {
        return category.categoryId === productCategory.id;
      });

      if (category)
        str = category.content.name + (str ? " > "+str : str);

      if (productCategory.parent)
        str = self._getCategoryMap(categories, productCategory.parent, str);

      return str;
    },
    _mapToBrontoCart: function(order, user){
      var self = this;
        if(order instanceof Backbone.Model)
            order = order.toJSON();

        var pageContext = this._getPageContext();

        var brCart = {
          "cartPhase": this._getCartPhase(),
          "currency": order.currencyCode,
          "subtotal": order.subtotal,
          "discountAmount": order.discountTotal,
          "taxAmount": order.taxTotal,
          "grandTotal": order.total,
          "orderId": order.id,
          //"emailAddress": "example@example.com",  //omit line if value not available

          "lineItems": []
        };

        if (order && (order.id || order.originalCartId))
            brCart.cartUrl =  this._getPageContext().secureHost + "/cart/recover/"+(this.isCart ? order.id : order.originalCartId);

        if (order.orderNumber)
          brCart.orderId = order.orderNumber;

        if(user && user.email && user.email.length)
          brCart.emailAddress = user.email;

        if (order && order.emailAddress && order.emailAddress.length)
          brCart.emailAddress = order.emailAddress;

         var deferred = $.Deferred();
        if(order.items && order.items.length){
          var categories = _.map(_.map(order.items, function(item) { return item.product.categories; }), function(categories) { return _.last(categories); });

          var ids = [];
          if (categories)
              ids = self._getCategoryIds(categories, ids);


         self._getCategories(ids).then(function(categories){
          _.forEach(order.items, function(lineItem){
              var lineItemProduct = lineItem.product;
              var item = {
                "sku": lineItemProduct.productCode,
                "name": lineItemProduct.name,
                "unitPrice": lineItemProduct.price.price,
                "quantity": lineItem.quantity,
                "totalPrice": lineItem.total,
                "productUrl": window.location.origin + (lineItemProduct.url ? lineItemProduct.url : '/p/' + lineItemProduct.productCode)
              };

              if (lineItemProduct.imageUrl)
                item.imageUrl = lineItemProduct.imageUrl;

              if (lineItemProduct.description)
                item.description = lineItemProduct.description;

              if (categories)
                item.category = self._getCategoryMap(categories.items, _.last(lineItemProduct.categories),"");

              if (lineItemProduct.price.salePrice)
                item.salePrice = lineItemProduct.price.salePrice;

              brCart.lineItems.push(item);
            });
            deferred.resolve(brCart);
          });
        } else
          deferred.resolve(brCart);

         return deferred.promise();
       // return brCart;
    }
 };


   $(document).ready(function() {
      var pageContext = require.mozuData('pagecontext');

       brontoCartWidget.init(pageContext);
    });

});

