import webapp2

class MainPage(webapp2.RequestHandler):
  def get(self):
    # self.response.headers['Content-Type'] = 'text/plain'
    # self.response.out.write('Hello, WebApp World!')
    return webapp2.redirect('/map/map.html')

app = webapp2.WSGIApplication([
    ('/', MainPage),
], debug=True)