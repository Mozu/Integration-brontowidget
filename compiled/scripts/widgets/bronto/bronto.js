define(['modules/models-checkout', 'hyprlivecontext','underscore', 'modules/jquery-mozu',], function (Checkout, HyprLiveContext, _, $) {


   $(document).ready(function() {

       var user = require.mozuData('user');
       var checkoutData = require.mozuData('checkout');
      var checkoutModel = window.order;

       console.log(user);
       console.log(checkoutData);
       console.log(checkoutModel);



       if (checkoutModel) {
         checkoutModel.listenTo(checkoutModel,'stepstatuschange', function() {
             console.log(window.order);
          });
        }
    });

});
